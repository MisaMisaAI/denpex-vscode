import * as cp from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as util from 'util';

const execFile = util.promisify(cp.execFile);

export interface GpuInfo {
    name: string;
    driverVersion: string;
    computeCapability: string;
    eccEnabled: boolean;
    memoryTotalMb: number;
}

export interface PreflightCheckItem {
    id: string;
    title: string;
    status: 'pass' | 'warn' | 'fail';
    message: string;
    details?: string;
}

export interface PreflightReport {
    timestamp: string;
    platform: string;
    shmSizeMb: number | null;
    gpus: GpuInfo[];
    envVars: Record<string, string | undefined>;
    checks: PreflightCheckItem[];
}

export async function runPreflightChecks(): Promise<PreflightReport> {
    const checks: PreflightCheckItem[] = [];
    const gpus: GpuInfo[] = [];
    let shmSizeMb: number | null = null;

    // 1. GPU Detection via nvidia-smi
    try {
        const { stdout } = await execFile('nvidia-smi', [
            '--query-gpu=name,driver_version,compute_cap,ecc.mode.current,memory.total',
            '--format=csv,noheader,nounits'
        ]);
        const lines = stdout.trim().split('\n').filter(Boolean);
        for (const line of lines) {
            const parts = line.split(',').map(p => p.trim());
            if (parts.length >= 5) {
                const eccEnabled = parts[3].toLowerCase() === 'enabled' || parts[3].toLowerCase() === 'on';
                gpus.push({
                    name: parts[0],
                    driverVersion: parts[1],
                    computeCapability: parts[2],
                    eccEnabled,
                    memoryTotalMb: parseInt(parts[4], 10) || 0
                });
            }
        }

        if (gpus.length > 0) {
            checks.push({
                id: 'gpu-detection',
                title: 'NVIDIA GPU Detection',
                status: 'pass',
                message: `Detected ${gpus.length} GPU(s): ${gpus.map(g => g.name).join(', ')}`
            });

            // Check ECC status
            const nonEccGpus = gpus.filter(g => !g.eccEnabled);
            if (nonEccGpus.length > 0) {
                checks.push({
                    id: 'gpu-ecc',
                    title: 'GPU ECC Status',
                    status: 'warn',
                    message: `${nonEccGpus.length} GPU(s) have ECC disabled. Bit flips may cause silent corruption in long training runs.`
                });
            } else {
                checks.push({
                    id: 'gpu-ecc',
                    title: 'GPU ECC Status',
                    status: 'pass',
                    message: 'ECC is enabled on all detected GPUs.'
                });
            }
        } else {
            checks.push({
                id: 'gpu-detection',
                title: 'NVIDIA GPU Detection',
                status: 'fail',
                message: 'nvidia-smi executed but returned no GPUs.'
            });
        }
    } catch (error) {
        checks.push({
            id: 'gpu-detection',
            title: 'NVIDIA GPU Detection',
            status: 'warn',
            message: 'nvidia-smi not found or failed to execute. Ensure NVIDIA drivers are installed on this node.',
            details: error instanceof Error ? error.message : String(error)
        });
    }

    // 2. Linux /dev/shm Size Check
    if (os.platform() === 'linux') {
        try {
            const stats = await (fs.promises as any).statfs?.('/dev/shm');
            if (stats) {
                const totalBytes = stats.bsize * stats.blocks;
                shmSizeMb = Math.round(totalBytes / (1024 * 1024));

                if (shmSizeMb < 2048) {
                    checks.push({
                        id: 'dev-shm',
                        title: 'Shared Memory (/dev/shm)',
                        status: 'fail',
                        message: `/dev/shm size is ${shmSizeMb}MB (below the 2048MB recommended minimum). This frequently triggers DataLoader worker crashes in PyTorch.`
                    });
                } else {
                    checks.push({
                        id: 'dev-shm',
                        title: 'Shared Memory (/dev/shm)',
                        status: 'pass',
                        message: `/dev/shm size is adequate (${shmSizeMb}MB).`
                    });
                }
            }
        } catch (error) {
            checks.push({
                id: 'dev-shm',
                title: 'Shared Memory (/dev/shm)',
                status: 'warn',
                message: 'Unable to inspect /dev/shm filesystem metrics.',
                details: error instanceof Error ? error.message : String(error)
            });
        }
    } else {
        checks.push({
            id: 'dev-shm',
            title: 'Shared Memory (/dev/shm)',
            status: 'pass',
            message: `Platform is ${os.platform()}; /dev/shm check skipped.`
        });
    }

    // 3. PyTorch & CUDA version alignment probe via python
    const pythonCmd = os.platform() === 'win32' ? 'python' : 'python3';
    try {
        const { stdout } = await execFile(pythonCmd, [
            '-c',
            'import torch; print(torch.__version__); print(torch.version.cuda); print(torch.cuda.is_available())'
        ]);
        const [torchVer, cudaVer, cudaAvail] = stdout.trim().split('\n').map(s => s.trim());
        const isAvailable = cudaAvail === 'True';

        if (!isAvailable && gpus.length > 0) {
            checks.push({
                id: 'pytorch-cuda',
                title: 'PyTorch & CUDA Alignment',
                status: 'fail',
                message: `PyTorch (v${torchVer}) reports CUDA is not available, despite ${gpus.length} NVIDIA GPU(s) detected. Check CUDA toolkit vs PyTorch build mismatch.`
            });
        } else {
            checks.push({
                id: 'pytorch-cuda',
                title: 'PyTorch & CUDA Alignment',
                status: 'pass',
                message: `PyTorch v${torchVer} linked with CUDA v${cudaVer || 'CPU'} (CUDA Available: ${cudaAvail})`
            });
        }
    } catch (error) {
        checks.push({
            id: 'pytorch-cuda',
            title: 'PyTorch & CUDA Alignment',
            status: 'warn',
            message: `Could not probe PyTorch environment via ${pythonCmd}.`,
            details: error instanceof Error ? error.message : String(error)
        });
    }

    // 4. Key Environment Variables
    const envVars = {
        NCCL_DEBUG: process.env.NCCL_DEBUG,
        TORCH_DISTRIBUTED_DEBUG: process.env.TORCH_DISTRIBUTED_DEBUG,
        CUDA_VISIBLE_DEVICES: process.env.CUDA_VISIBLE_DEVICES
    };

    if (!envVars.NCCL_DEBUG) {
        checks.push({
            id: 'env-nccl',
            title: 'Environment: NCCL_DEBUG',
            status: 'warn',
            message: 'NCCL_DEBUG is not set. Setting NCCL_DEBUG=INFO is recommended for debugging distributed communication hangs.'
        });
    } else {
        checks.push({
            id: 'env-nccl',
            title: 'Environment: NCCL_DEBUG',
            status: 'pass',
            message: `NCCL_DEBUG is set to "${envVars.NCCL_DEBUG}".`
        });
    }

    return {
        timestamp: new Date().toISOString(),
        platform: `${os.platform()} ${os.release()} (${os.arch()})`,
        shmSizeMb,
        gpus,
        envVars,
        checks
    };
}
