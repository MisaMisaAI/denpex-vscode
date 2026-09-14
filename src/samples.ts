export type SampleFailureId =
    | 'nccl-rank-oom'
    | 'xid-79'
    | 'nccl-interface-mismatch'
    | 'kubernetes-device-plugin'
    | 'vllm-kv-cache';

export interface SampleFailure {
    id: SampleFailureId;
    title: string;
    description: string;
    logs: string;
    /** Accepted canonical owners used by the release verification script. */
    expectedFailureTypes: string[];
}

/**
 * Realistic, compact incidents that make the causal distinction visible in one click.
 * They are synthetic reproductions of common log shapes, never customer logs.
 */
export const SAMPLE_FAILURES: readonly SampleFailure[] = [
    {
        id: 'nccl-rank-oom',
        title: 'Rank-local OOM → NCCL timeout cascade',
        description: 'Rank 3 exhausts memory; ranks 0, 1, and 2 are collateral watchdog victims.',
        expectedFailureTypes: ['CUDA_OOM_CASCADE', 'CUDA_OOM', 'GPU_OOM', 'PYTORCH_CUDA_OOM'],
        logs: `[2026-08-23 17:42:11.008] node=trainer-02 rank=3 local_rank=3 step=18421
torch.OutOfMemoryError: CUDA out of memory. Tried to allocate 6.00 GiB. GPU 3 has a total capacity of 79.15 GiB of which 1.84 GiB is free. Process 88421 has 76.92 GiB memory in use. Of the allocated memory 72.38 GiB is allocated by PyTorch, and 3.91 GiB is reserved by PyTorch but unallocated.
[2026-08-23 17:42:11.031] node=trainer-02 rank=3 training loop aborted before entering seq=918233 ALLREDUCE
[2026-08-23 18:12:11.042] node=trainer-01 rank=0 [E ProcessGroupNCCL.cpp:607] [Rank 0] Watchdog caught collective operation timeout: WorkNCCL(SeqNum=918233, OpType=ALLREDUCE, NumelIn=67108864, NumelOut=67108864, Timeout(ms)=1800000) ran for 1800007 milliseconds before timing out.
[2026-08-23 18:12:11.044] node=trainer-01 rank=1 [E ProcessGroupNCCL.cpp:607] [Rank 1] Watchdog caught collective operation timeout: WorkNCCL(SeqNum=918233, OpType=ALLREDUCE, Timeout(ms)=1800000).
[2026-08-23 18:12:11.047] node=trainer-02 rank=2 [E ProcessGroupNCCL.cpp:607] [Rank 2] Watchdog caught collective operation timeout: WorkNCCL(SeqNum=918233, OpType=ALLREDUCE, Timeout(ms)=1800000).
[2026-08-23 18:12:11.050] torch.distributed.DistBackendError: NCCL communicator was aborted on rank 0`,
    },
    {
        id: 'xid-79',
        title: 'Xid 79: GPU fallen off the bus',
        description: 'A PCIe-level device loss, not the downstream CUDA launch error.',
        expectedFailureTypes: ['GPU_OFF_BUS', 'GPU_XID_79', 'XID_79'],
        logs: `[Sun Aug 23 17:58:44 2026] NVRM: GPU at PCI:0000:8a:00: GPU-5d9d77a0-4e4a-44d1-9eb7-2cbb4bc54c1e
[Sun Aug 23 17:58:44 2026] NVRM: Xid (PCI:0000:8a:00): 79, pid=55182, name=python, GPU has fallen off the bus.
[Sun Aug 23 17:58:44 2026] NVRM: A GPU crash dump has been created. If possible, please run nvidia-bug-report.sh as root.
[rank7]: RuntimeError: CUDA error: unspecified launch failure
[rank7]: CUDA kernel errors might be asynchronously reported at some other API call`,
    },
    {
        id: 'nccl-interface-mismatch',
        title: 'NCCL interface mismatch',
        description: 'One node selects ib0 while its peer is forced onto eth0.',
        expectedFailureTypes: ['NCCL_SOCKET_IFNAME_FALLBACK', 'NCCL_SOCKET_INTERFACE', 'NCCL_INTERFACE_MISMATCH', 'NCCL_NETWORK_INTERFACE_MISMATCH', 'NCCL_SOCKET_IFNAME_INVALID'],
        logs: `[trainer-a:129884] NCCL INFO Bootstrap : Using ib0:10.42.8.11<0>
[trainer-a:129884] NCCL INFO NET/Socket : Using [0]ib0:10.42.8.11<0>
[trainer-a:129884] NCCL INFO NCCL_SOCKET_IFNAME set by environment to ib0
[trainer-b:87721] NCCL INFO Bootstrap : Using eth0:172.19.0.12<0>
[trainer-b:87721] NCCL INFO NET/Socket : Using [0]eth0:172.19.0.12<0>
[trainer-b:87721] NCCL INFO NCCL_SOCKET_IFNAME set by environment to eth0
[trainer-b:87721] NCCL WARN socketStartConnect: Connect to 10.42.8.11<43791> failed : Network is unreachable
[trainer-a:129884] NCCL WARN bootstrap.cc:270 -> 2
torch.distributed.DistBackendError: NCCL error in ProcessGroupNCCL.cpp:1275, unhandled system error`,
    },
    {
        id: 'kubernetes-device-plugin',
        title: 'Kubernetes device-plugin stale health',
        description: 'Kubelet advertises a GPU that the NVIDIA device plugin already marked unhealthy.',
        expectedFailureTypes: ['K8S_DEVICE_PLUGIN_STALE_XID_HEALTH_REGISTRATION', 'KS_DEVICE_PLUGIN_UNHEALTHY_STATE_RETENTION', 'K8S_GPU_DEVICE_PLUGIN_STALE', 'K8S_DEVICE_PLUGIN', 'KUBERNETES_GPU_DEVICE_PLUGIN', 'NVIDIA_DEVICE_PLUGIN_UNHEALTHY'],
        logs: `[stack] Kubernetes, NVIDIA device plugin from GPU Operator 23.9.2, H100 node
XidCriticalError: Xid=94 on Device=GPU-d23d91a3; marking device as unhealthy
node Capacity nvidia.com/gpu: 8
node Allocatable nvidia.com/gpu: 7
Later nvidia-smi sees all 8 GPUs and the Xid is resolved, but Allocatable remains 7.
Control: restarting only nvidia-device-plugin-daemonset re-registers the devices and Allocatable returns to 8.`,
    },
    {
        id: 'vllm-kv-cache',
        title: 'vLLM KV-cache exhaustion',
        description: 'The configured context and concurrency do not fit the available cache blocks.',
        expectedFailureTypes: ['INFERENCE_KV_CACHE_EXHAUSTION', 'VLLM_KV_CACHE_EXHAUSTION', 'VLLM_KV_CACHE', 'VLLM_NO_AVAILABLE_CACHE_BLOCKS'],
        logs: `(EngineCore_DP0 pid=48217) INFO gpu_worker.py:237] Available KV cache memory: 5.73 GiB
(EngineCore_DP0 pid=48217) INFO kv_cache_utils.py:756] GPU KV cache size: 36,864 tokens
(EngineCore_DP0 pid=48217) INFO kv_cache_utils.py:760] Maximum concurrency for 32,768 tokens per request: 1.12x
(EngineCore_DP0 pid=48217) ERROR core.py:412] No available memory for the cache blocks. Try increasing gpu_memory_utilization when initializing the engine.
ValueError: The model's max seq len (131072) is larger than the maximum number of tokens that can be stored in KV cache (36864). Try increasing gpu_memory_utilization or decreasing max_model_len.`,
    },
] as const;

export function sampleFailure(id: string): SampleFailure | undefined {
    return SAMPLE_FAILURES.find((sample) => sample.id === id);
}
