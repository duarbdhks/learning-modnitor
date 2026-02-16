var SCENARIO_LAB12 = {
  id: 'lab12-cpu-throttle-network',
  title: 'CPU Throttling + Network Saturation',
  difficulty: 'expert',

  alert: {
    severity: 'critical',
    source: 'Datadog Monitor',
    timestamp: '2024-05-12 12:58:42 KST',
    title: '[P1] Pod CPU throttling > 50% + TCP retransmission spike',
    message: 'API Gateway Pod의 CPU throttling이 60%를 초과하고 있으며, 동시에 TCP retransmission이 급증하고 있습니다. p99 레이턴시가 5초를 초과했습니다.',
    metric: { name: 'container.cpu.throttled', value: '62', unit: '%', threshold: '10' },
    tags: ['cluster:prod-eks', 'env:production', 'severity:p1']
  },

  briefing: {
    description: '일요일 낮 12시 58분, 마케팅 캠페인으로 트래픽이 평소 대비 2.5배 증가했습니다. 비용 최적화를 위해 모든 마이크로서비스의 CPU limit을 200m로 설정했는데, 이제 Pod들이 CPU limit에 도달하면서 CFS throttling이 발생하고 있습니다. 동시에 conntrack 테이블도 포화 상태에 근접하면서 TCP retransmission이 급증하고 있습니다. p99 응답 시간이 5초를 초과하며 사용자 이탈이 발생하고 있습니다.',
    environment: {
      services: ['api-gateway (Go)', 'product-service (Go)', 'EKS Node'],
      infra: 'EKS, Pods with CPU limit 200m, conntrack_max=65536',
      monitoring: 'Datadog Infrastructure + APM'
    }
  },

  optimalPath: ['step-1', 'step-2a', 'step-3a', 'step-4a', 'step-final'],

  scoring: {
    gradeThresholds: {
      S: { maxExtraSteps: 0, maxHints: 0, label: 'Senior SRE' },
      A: { maxExtraSteps: 2, maxHints: 1, label: 'Proficient' },
      B: { maxExtraSteps: 4, maxHints: 2, label: 'Developing' },
      C: { maxExtraSteps: Infinity, maxHints: Infinity, label: 'Learning' }
    }
  },

  steps: {
    'step-1': {
      title: 'Pod 응답시간 불안정',
      description: 'Datadog Infrastructure 대시보드를 열어 api-gateway Pod의 메트릭을 확인합니다. CPU 사용량이 limit 200m에 거의 도달했고, p99 응답시간만 급격히 증가하는 패턴이 보입니다.',
      metrics: [
        {
          title: 'CPU Usage vs Limit',
          chartType: 'line',
          chartConfig: {
            labels: ['09:00', '10:00', '11:00', '12:00', '12:30', '13:00', '13:15', '13:20'],
            datasets: [
              {
                label: 'cpu.usage.total (millicores)',
                data: [120, 150, 180, 195, 198, 200, 200, 200],
                borderColor: '#ef4444',
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                tension: 0.3,
                fill: true
              },
              {
                label: 'cpu.limits (millicores)',
                data: [200, 200, 200, 200, 200, 200, 200, 200],
                borderColor: '#6b7280',
                backgroundColor: 'rgba(107, 114, 128, 0.1)',
                tension: 0,
                borderDash: [5, 5]
              }
            ]
          }
        },
        {
          title: 'Response Time p50 vs p99',
          chartType: 'line',
          chartConfig: {
            labels: ['09:00', '10:00', '11:00', '12:00', '12:30', '13:00', '13:15', '13:20'],
            datasets: [
              {
                label: 'p50 (ms)',
                data: [45, 48, 52, 55, 58, 62, 65, 68],
                borderColor: '#10b981',
                backgroundColor: 'rgba(16, 185, 129, 0.1)',
                tension: 0.3,
                fill: true
              },
              {
                label: 'p99 (ms)',
                data: [120, 150, 280, 680, 1200, 2800, 4500, 5200],
                borderColor: '#f59e0b',
                backgroundColor: 'rgba(245, 158, 11, 0.1)',
                tension: 0.3,
                fill: true
              }
            ]
          }
        }
      ],
      logs: [
        { timestamp: '12:58:05', level: 'WARN', service: 'api-gateway', message: '[http-server] Request processing slow, p99 latency: 4.8s (threshold: 1s)' },
        { timestamp: '12:58:12', level: 'ERROR', service: 'api-gateway', message: '[cpu-monitor] CPU usage at limit (200m/200m), throttling detected' },
        { timestamp: '12:58:18', level: 'WARN', service: 'datadog-agent', message: '[container] container.cpu.throttled: 62% — high throttling detected' },
        { timestamp: '12:58:25', level: 'ERROR', service: 'product-service', message: '[grpc-client] Upstream timeout: context deadline exceeded (5s)' },
        { timestamp: '12:58:32', level: 'WARN', service: 'eks-node', message: '[kernel] nf_conntrack: table full, dropping packet' }
      ],
      choices: [
        {
          text: 'CFS throttling 확인',
          isOptimal: true,
          feedback: '정확한 판단입니다. CPU usage가 limit에 도달했을 때 p99만 급등하는 것은 CFS throttling의 전형적인 증상입니다.',
          nextStep: 'step-2a'
        },
        {
          text: '네트워크 에러 분석',
          isOptimal: false,
          feedback: '네트워크 에러도 발생하고 있지만, 먼저 CPU throttling을 확인하는 것이 더 직접적인 접근입니다.',
          nextStep: 'step-2b'
        },
        {
          text: 'HPA 설정으로 Pod 증설',
          isOptimal: false,
          feedback: 'HPA는 CPU request 기반으로 스케일링합니다. CPU limit 문제를 먼저 해결해야 합니다.',
          nextStep: 'step-2c-deadend'
        }
      ],
      hint: 'CPU usage가 limit에 거의 도달하면 CFS가 CPU를 throttle합니다. p99만 급등하는 것은 throttling의 전형적 증상입니다.'
    },

    'step-2a': {
      title: 'CFS CPU Throttling 분석',
      description: 'kubectl top과 cAdvisor 메트릭을 확인한 결과, CFS throttled periods가 급증하고 있습니다. CPU limit 200m에 도달한 Pod들이 CFS에 의해 강제로 제한되면서 요청 처리가 지연되고 있습니다.',
      metrics: [
        {
          title: 'CFS Throttled vs Total Periods',
          chartType: 'line',
          chartConfig: {
            labels: ['09:00', '10:00', '11:00', '12:00', '12:30', '13:00', '13:15', '13:20'],
            datasets: [
              {
                label: 'cfs.throttled.periods',
                data: [5, 12, 45, 180, 420, 680, 850, 920],
                borderColor: '#ef4444',
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                tension: 0.3,
                fill: true
              },
              {
                label: 'cfs.periods.total',
                data: [1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000],
                borderColor: '#6b7280',
                backgroundColor: 'rgba(107, 114, 128, 0.1)',
                tension: 0,
                borderDash: [5, 5]
              }
            ]
          }
        },
        {
          title: 'Throttle Rate (%)',
          chartType: 'line',
          chartConfig: {
            labels: ['09:00', '10:00', '11:00', '12:00', '12:30', '13:00', '13:15', '13:20'],
            datasets: [
              {
                label: 'throttle_rate (%)',
                data: [0.5, 1.2, 4.5, 18, 42, 68, 85, 92],
                borderColor: '#f59e0b',
                backgroundColor: 'rgba(245, 158, 11, 0.2)',
                tension: 0.3,
                fill: true
              },
              {
                label: 'threshold (10%)',
                data: [10, 10, 10, 10, 10, 10, 10, 10],
                borderColor: '#dc2626',
                backgroundColor: 'transparent',
                borderDash: [10, 5],
                tension: 0
              }
            ]
          }
        }
      ],
      logs: [
        { timestamp: '13:00:00', level: 'INFO', service: 'k8s-metrics', message: '[cAdvisor] container.cpu.cfs.throttled.periods: 680/1000 (68%)' },
        { timestamp: '13:00:05', level: 'WARN', service: 'api-gateway', message: '[runtime] Goroutines waiting for CPU time, scheduler latency increased' },
        { timestamp: '13:00:12', level: 'INFO', service: 'datadog-agent', message: '[container] CPU throttling at 68% — requests are being delayed by kernel CFS' },
        { timestamp: '13:00:18', level: 'ERROR', service: 'product-service', message: '[grpc] Server processing delayed, context deadline exceeded in 45% of requests' }
      ],
      choices: [
        {
          text: '네트워크도 함께 확인',
          isOptimal: true,
          feedback: '탁월한 판단입니다. CPU throttling을 확인했으니 이제 동시에 발생하는 네트워크 문제도 분석해야 합니다.',
          nextStep: 'step-3a'
        },
        {
          text: 'CPU limit을 제거하여 즉시 해결',
          isOptimal: false,
          feedback: 'CPU limit 제거는 또 다른 위험을 만듭니다. 더 신중한 접근이 필요합니다.',
          nextStep: 'step-3b-deadend'
        }
      ],
      hint: 'CFS throttling이 10% 이상이면 성능에 영향을 줍니다. 하지만 limit 제거는 신중해야 하며, 네트워크 문제도 동시에 확인해야 합니다.'
    },

    'step-2b': {
      title: '네트워크 에러 분석',
      description: 'netstat과 conntrack 메트릭을 확인한 결과, TCP retransmission이 급증하고 conntrack 테이블이 거의 포화 상태입니다. 하지만 CPU throttling도 함께 발생하고 있으므로 근본 원인을 찾기 위해 CPU 분석도 필요합니다.',
      metrics: [
        {
          title: 'TCP Retransmission + Conntrack',
          chartType: 'line',
          chartConfig: {
            labels: ['09:00', '10:00', '11:00', '12:00', '12:30', '13:00', '13:15', '13:20'],
            datasets: [
              {
                label: 'tcp.retrans_segs',
                data: [12, 18, 45, 180, 450, 1200, 2800, 3200],
                borderColor: '#ef4444',
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                tension: 0.3,
                fill: true,
                yAxisID: 'y'
              },
              {
                label: 'conntrack.count',
                data: [12000, 15000, 22000, 35000, 52000, 58000, 61000, 64000],
                borderColor: '#f59e0b',
                backgroundColor: 'rgba(245, 158, 11, 0.1)',
                tension: 0.3,
                fill: false,
                yAxisID: 'y1'
              },
              {
                label: 'conntrack.max',
                data: [65536, 65536, 65536, 65536, 65536, 65536, 65536, 65536],
                borderColor: '#dc2626',
                backgroundColor: 'transparent',
                borderDash: [5, 5],
                tension: 0,
                yAxisID: 'y1'
              }
            ],
            scales: {
              y: { type: 'linear', display: true, position: 'left' },
              y1: { type: 'linear', display: true, position: 'right' }
            }
          }
        }
      ],
      logs: [
        { timestamp: '13:05:00', level: 'WARN', service: 'eks-node', message: '[kernel] nf_conntrack: table full, dropping packet (64000/65536)' },
        { timestamp: '13:05:05', level: 'ERROR', service: 'api-gateway', message: '[tcp] Retransmission timeout, connection reset by peer' },
        { timestamp: '13:05:12', level: 'INFO', service: 'datadog-agent', message: '[network] tcp.retrans_segs: 2800/s — significantly above baseline (12/s)' }
      ],
      choices: [
        {
          text: 'CPU throttling도 함께 확인',
          isOptimal: true,
          feedback: '올바른 판단입니다. 네트워크와 CPU 문제가 복합적으로 발생하고 있으므로 CPU throttling 분석이 필요합니다.',
          nextStep: 'step-2a'
        }
      ],
      hint: 'TCP retransmission과 conntrack 포화가 발생하고 있지만, CPU throttling도 동시에 발생 중입니다. 복합 장애이므로 양쪽을 모두 확인해야 합니다.'
    },

    'step-2c-deadend': {
      title: 'HPA + Request 증가 — Dead End',
      description: 'CPU request를 200m로 설정하고 HPA로 Pod를 증설했지만, 각 Pod의 CPU limit이 여전히 200m이므로 throttling이 계속 발생합니다. Request는 스케줄링 보장량이고 limit은 최대 사용량입니다. Limit을 조정하지 않으면 throttling은 해결되지 않습니다.',
      isDeadEnd: true,
      metrics: [
        {
          title: 'Pod Count 증가 후에도 Throttling 지속',
          chartType: 'line',
          chartConfig: {
            labels: ['13:00', '13:05', '13:10', '13:15', '13:20', '13:25'],
            datasets: [
              {
                label: 'pod_count',
                data: [3, 5, 8, 8, 8, 8],
                borderColor: '#3b82f6',
                backgroundColor: 'rgba(59, 130, 246, 0.1)',
                tension: 0.3,
                fill: true,
                yAxisID: 'y'
              },
              {
                label: 'throttle_rate (%) — per pod',
                data: [68, 65, 62, 60, 58, 55],
                borderColor: '#ef4444',
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                tension: 0.3,
                fill: false,
                yAxisID: 'y1'
              }
            ],
            scales: {
              y: { type: 'linear', display: true, position: 'left' },
              y1: { type: 'linear', display: true, position: 'right' }
            }
          }
        }
      ],
      logs: [
        { timestamp: '13:10:00', level: 'INFO', service: 'k8s-hpa', message: '[autoscaler] Scaled api-gateway from 3 to 8 replicas based on CPU request utilization' },
        { timestamp: '13:15:00', level: 'WARN', service: 'datadog-agent', message: '[container] Each pod still throttled at 60% — limit not adjusted' },
        { timestamp: '13:20:00', level: 'ERROR', service: 'api-gateway', message: '[cpu-monitor] CPU usage: 200m/200m (limit reached), p99 latency: 3.2s' }
      ],
      learningMoment: {
        title: 'Request와 Limit의 차이를 이해해야 한다',
        explanation: 'CPU request는 스케줄링 보장량이며 HPA의 기준이 됩니다. CPU limit은 Pod가 사용할 수 있는 최대 CPU입니다. Request만 늘려서 Pod를 증설해도, 각 Pod의 limit이 실제 워크로드보다 낮으면 throttling은 계속됩니다. p99 레이턴시 기반으로 적절한 limit을 설정해야 합니다.',
        moduleReference: '모듈 9: Memory Leak 및 OOMKill 장애'
      },
      redirectTo: 'step-1',
      redirectMessage: '처음으로 돌아가서 CPU throttling의 근본 원인을 분석하세요.'
    },

    'step-3a': {
      title: 'Network + Conntrack 복합 분석',
      description: 'conntrack 테이블이 98% 포화 상태이며, TCP TIME_WAIT와 CLOSE_WAIT 소켓이 비정상적으로 많이 쌓여 있습니다. CPU throttling으로 인해 연결 종료 처리가 지연되면서 conntrack 엔트리가 빠르게 정리되지 못하고 있습니다. 두 문제가 서로 악순환을 만들고 있습니다.',
      metrics: [
        {
          title: 'Conntrack Count vs Max',
          chartType: 'line',
          chartConfig: {
            labels: ['09:00', '10:00', '11:00', '12:00', '12:30', '13:00', '13:15', '13:20'],
            datasets: [
              {
                label: 'conntrack.count',
                data: [12000, 15000, 22000, 35000, 52000, 58000, 61000, 64000],
                borderColor: '#f59e0b',
                backgroundColor: 'rgba(245, 158, 11, 0.1)',
                tension: 0.3,
                fill: true
              },
              {
                label: 'conntrack.max',
                data: [65536, 65536, 65536, 65536, 65536, 65536, 65536, 65536],
                borderColor: '#dc2626',
                backgroundColor: 'transparent',
                borderDash: [5, 5],
                tension: 0
              }
            ]
          }
        },
        {
          title: 'TCP State Distribution',
          chartType: 'bar',
          chartConfig: {
            labels: ['ESTABLISHED', 'TIME_WAIT', 'CLOSE_WAIT'],
            datasets: [
              {
                label: 'Normal (baseline)',
                data: [800, 200, 50],
                backgroundColor: '#10b981'
              },
              {
                label: 'Current (13:20)',
                data: [18000, 35000, 12000],
                backgroundColor: '#dc2626'
              }
            ]
          }
        },
        {
          title: 'TCP Retransmission Segments',
          chartType: 'line',
          chartConfig: {
            labels: ['09:00', '10:00', '11:00', '12:00', '12:30', '13:00', '13:15', '13:20'],
            datasets: [
              {
                label: 'tcp.retrans_segs',
                data: [12, 18, 45, 180, 450, 1200, 2800, 3200],
                borderColor: '#ef4444',
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                tension: 0.3,
                fill: true
              }
            ]
          }
        }
      ],
      logs: [
        { timestamp: '13:20:00', level: 'ERROR', service: 'eks-node', message: '[kernel] nf_conntrack: table full (64000/65536), dropping new connections' },
        { timestamp: '13:20:05', level: 'WARN', service: 'api-gateway', message: '[tcp] TIME_WAIT sockets: 35000 (normal: 200) — connection close delayed by CPU throttling' },
        { timestamp: '13:20:12', level: 'INFO', service: 'datadog-agent', message: '[network] tcp.retrans_segs spike correlates with CPU throttling spikes' },
        { timestamp: '13:20:18', level: 'ERROR', service: 'product-service', message: '[grpc] Connection pool exhausted, new connections dropped by kernel' }
      ],
      choices: [
        {
          text: 'CPU limit + conntrack 동시 해결',
          isOptimal: true,
          feedback: '완벽한 판단입니다. CPU throttling과 conntrack 포화, TIME_WAIT 문제를 함께 해결해야 합니다.',
          nextStep: 'step-4a'
        }
      ],
      hint: 'CPU throttling이 연결 종료 처리를 지연시키고, 이로 인해 conntrack 테이블과 TIME_WAIT 소켓이 쌓이면서 네트워크 문제가 악화됩니다. 세 가지 문제를 동시에 해결해야 합니다.'
    },

    'step-3b-deadend': {
      title: 'CPU Limit 제거 — Dead End',
      description: 'CPU limit을 제거했더니 throttling은 사라졌지만, Pod가 Burstable QoS 클래스로 변경되면서 노드 리소스 부족 시 우선 순위가 낮아졌습니다. 또한 한 Pod가 CPU를 독점하면서 다른 Pod들이 영향을 받는 noisy neighbor 문제가 발생했습니다.',
      isDeadEnd: true,
      metrics: [
        {
          title: 'Limit 제거 후 CPU 사용량 폭주',
          chartType: 'line',
          chartConfig: {
            labels: ['13:25', '13:27', '13:29', '13:31', '13:33', '13:35'],
            datasets: [
              {
                label: 'pod-1 cpu.usage (millicores)',
                data: [200, 450, 1200, 1800, 2200, 2500],
                borderColor: '#ef4444',
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                tension: 0.3,
                fill: true
              },
              {
                label: 'pod-2 cpu.usage (millicores) — starved',
                data: [200, 180, 120, 80, 50, 35],
                borderColor: '#6b7280',
                backgroundColor: 'rgba(107, 114, 128, 0.1)',
                tension: 0.3,
                fill: false
              }
            ]
          }
        }
      ],
      logs: [
        { timestamp: '13:30:00', level: 'WARN', service: 'k8s-node', message: '[kubelet] Pod api-gateway-abc123 QoS class changed to Burstable (limit removed)' },
        { timestamp: '13:32:00', level: 'ERROR', service: 'k8s-node', message: '[cpu-manager] Noisy neighbor detected: pod-1 consuming 2.5 cores, starving pod-2' },
        { timestamp: '13:33:00', level: 'WARN', service: 'api-gateway-pod-2', message: '[runtime] CPU starvation, request processing severely delayed' },
        { timestamp: '13:35:00', level: 'ERROR', service: 'k8s-scheduler', message: '[eviction] Node under memory pressure, Burstable pods are eviction candidates' }
      ],
      learningMoment: {
        title: 'CPU Limit 제거는 또 다른 위험을 만든다',
        explanation: 'CPU limit을 제거하면 throttling은 사라지지만, QoS 클래스가 Burstable로 변경되어 노드 리소스 부족 시 먼저 종료될 수 있습니다. 또한 한 Pod가 CPU를 독점하면서 같은 노드의 다른 Pod들이 CPU를 확보하지 못하는 noisy neighbor 문제가 발생합니다. p99 레이턴시를 기준으로 적절한 limit을 설정하는 것이 best practice입니다.',
        moduleReference: '모듈 9: Memory Leak 및 OOMKill 장애'
      },
      redirectTo: 'step-2a',
      redirectMessage: 'CPU throttling 분석으로 돌아가서 적절한 limit 값을 찾아보세요.'
    },

    'step-4a': {
      title: 'CPU limit + conntrack + TIME_WAIT 해결',
      description: 'CPU limit을 200m에서 500m로 증가시키고, conntrack_max를 262144로 확대하며, net.ipv4.tcp_tw_reuse=1로 TIME_WAIT 재사용을 활성화했습니다. Throttle rate가 0.5% 이하로 떨어지고, conntrack 사용률도 22%로 안정화되었으며, TCP retransmission도 정상 수준으로 복구되었습니다.',
      metrics: [
        {
          title: 'Throttle Rate + Conntrack Recovery',
          chartType: 'line',
          chartConfig: {
            labels: ['13:30', '13:35', '13:40', '13:45', '13:50', '13:55'],
            datasets: [
              {
                label: 'throttle_rate (%)',
                data: [92, 65, 25, 8, 2, 0.5],
                borderColor: '#10b981',
                backgroundColor: 'rgba(16, 185, 129, 0.1)',
                tension: 0.3,
                fill: true,
                yAxisID: 'y'
              },
              {
                label: 'conntrack usage (%)',
                data: [98, 85, 62, 38, 25, 22],
                borderColor: '#3b82f6',
                backgroundColor: 'rgba(59, 130, 246, 0.1)',
                tension: 0.3,
                fill: false,
                yAxisID: 'y1'
              }
            ],
            scales: {
              y: { type: 'linear', display: true, position: 'left' },
              y1: { type: 'linear', display: true, position: 'right' }
            }
          }
        },
        {
          title: 'p99 Latency + Retrans Recovery',
          chartType: 'line',
          chartConfig: {
            labels: ['13:30', '13:35', '13:40', '13:45', '13:50', '13:55'],
            datasets: [
              {
                label: 'p99 latency (ms)',
                data: [5200, 2800, 800, 180, 130, 118],
                borderColor: '#10b981',
                backgroundColor: 'rgba(16, 185, 129, 0.1)',
                tension: 0.3,
                fill: true,
                yAxisID: 'y'
              },
              {
                label: 'tcp.retrans_segs',
                data: [2800, 1200, 350, 45, 12, 8],
                borderColor: '#8b5cf6',
                backgroundColor: 'rgba(139, 92, 246, 0.1)',
                tension: 0.3,
                fill: false,
                yAxisID: 'y1'
              }
            ],
            scales: {
              y: { type: 'linear', display: true, position: 'left' },
              y1: { type: 'linear', display: true, position: 'right' }
            }
          }
        }
      ],
      logs: [
        { timestamp: '13:35:00', level: 'INFO', service: 'k8s-controller', message: '[rollout] api-gateway updated with CPU limit 500m (was 200m)' },
        { timestamp: '13:38:00', level: 'INFO', service: 'eks-node', message: '[sysctl] net.netfilter.nf_conntrack_max = 262144 (was 65536)' },
        { timestamp: '13:38:05', level: 'INFO', service: 'eks-node', message: '[sysctl] net.ipv4.tcp_tw_reuse = 1 — TIME_WAIT socket reuse enabled' },
        { timestamp: '13:40:00', level: 'INFO', service: 'datadog-agent', message: '[container] throttle_rate dropped to 25% — CPU throttling recovering' },
        { timestamp: '13:45:00', level: 'INFO', service: 'datadog-agent', message: '[network] conntrack usage: 38% (100k/262k) — stable' },
        { timestamp: '13:50:00', level: 'INFO', service: 'api-gateway', message: '[http-server] p99 latency: 130ms (recovered from 5200ms)' },
        { timestamp: '13:55:00', level: 'INFO', service: 'datadog-agent', message: '[network] tcp.retrans_segs: 8/s (baseline: 12/s) — fully recovered' }
      ],
      choices: [
        {
          text: '재발 방지 대책 수립 및 사후 분석',
          isOptimal: true,
          feedback: '완벽합니다. 장애를 복구했으니 이제 재발 방지를 위한 장기 대책을 수립하고 팀 전체와 공유해야 합니다.',
          nextStep: 'step-final'
        }
      ],
      hint: 'CPU limit, conntrack, TIME_WAIT 세 가지 문제를 동시에 해결하면 복합 장애가 해소됩니다.'
    },

    'step-final': {
      title: '사후 분석 및 재발 방지',
      description: '장애가 완전히 복구되었습니다. 근본 원인은 비용 최적화를 위해 설정한 낮은 CPU limit(200m)이 트래픽 급증 시 CFS throttling을 유발했고, 이로 인해 연결 종료 처리가 지연되면서 conntrack 테이블 포화와 TIME_WAIT 소켓 누적이 동시에 발생한 복합 장애입니다.',
      isTerminal: true,
      rootCause: {
        title: 'CPU Throttling + Conntrack Saturation',
        summary: '비용 최적화로 설정한 CPU limit 200m이 마케팅 캠페인 트래픽 급증 시 CFS throttling(92%)을 유발하고, 이로 인한 연결 종료 지연으로 conntrack 포화(98%) + TIME_WAIT 소켓 누적(35000개) 복합 장애',
        timeline: [
          { time: '09:00', event: '마케팅 캠페인 시작, 트래픽 증가 시작 (1.0x → 1.5x)' },
          { time: '11:00', event: 'CPU usage 180m 도달, 초기 throttling 4.5% 시작' },
          { time: '12:00', event: '트래픽 2.0x, CPU limit 200m 도달, throttling 18%' },
          { time: '12:30', event: '트래픽 2.5x, throttling 42%, conntrack 52k/65k (79%)' },
          { time: '12:58', event: 'Datadog P1 알림 발생, throttling 62%, p99 레이턴시 5.2초' },
          { time: '13:00', event: 'CFS throttling 68%, conntrack 58k/65k (88%)' },
          { time: '13:15', event: 'Throttling 85%, conntrack 61k/65k (93%), TIME_WAIT 소켓 35000개' },
          { time: '13:20', event: 'Throttling 92%, conntrack 64k/65k (98%) — 복합 장애 최고점' },
          { time: '13:35', event: 'CPU limit 500m + conntrack 262k + tcp_tw_reuse 적용' },
          { time: '13:55', event: 'Throttling 0.5%, conntrack 22%, p99 레이턴시 118ms — 완전 복구' }
        ],
        resolution: [
          '즉시 조치: CPU limit 200m → 500m 증가, conntrack_max 65536 → 262144 확대, net.ipv4.tcp_tw_reuse=1 활성화',
          'CPU limit 가이드라인: p95 레이턴시 기반으로 적절한 limit 설정, throttle rate 10% 미만 유지',
          'Conntrack 튜닝: 고트래픽 노드는 nf_conntrack_max=262144, tcp_tw_reuse=1 기본 설정',
          '모니터링 강화: container.cpu.throttled > 10%, conntrack usage > 80% 알림 설정',
          '비용 vs 안정성: CPU limit을 너무 낮게 설정하면 비용 절감보다 장애 비용이 더 큽니다. p99 레이턴시 목표 기반으로 limit 설정',
          '카나리 테스트: 트래픽 급증 예정 시 미리 limit 증가 후 모니터링, 문제 없으면 유지'
        ]
      },
      postMortem: {
        template: {
          fields: [
            {
              label: 'CFS CPU throttling을 확인하는 메트릭은?',
              type: 'text',
              placeholder: 'container.cpu.cfs.throttled.periods',
              hint: 'cAdvisor가 제공하는 CFS throttle 메트릭'
            },
            {
              label: 'CPU limit에 도달했을 때 p99만 급등하는 이유는? (간단히 설명)',
              type: 'textarea',
              placeholder: 'CFS가 CPU를 주기적으로 제한하면서 일부 요청만 지연되고, 대부분은 정상 처리되므로 p50은 안정적이지만 p99는 급등합니다.',
              hint: 'CFS throttling의 특징'
            },
            {
              label: 'Conntrack 테이블 포화를 해결하기 위한 방법은? (여러 개 선택 가능)',
              type: 'textarea',
              placeholder: '1. nf_conntrack_max 증가\n2. net.ipv4.tcp_tw_reuse=1 활성화\n3. 연결 풀 크기 최적화\n4. Keep-alive timeout 조정',
              hint: 'Kernel parameter 튜닝과 애플리케이션 레벨 최적화'
            },
            {
              label: '이번 장애에서 배운 핵심 교훈 3가지를 작성하세요.',
              type: 'textarea',
              placeholder: '1. CPU limit은 p99 레이턴시 기반으로 설정\n2. Throttling + conntrack 복합 장애 인지\n3. 비용 최적화는 안정성 목표 내에서 진행',
              hint: 'CPU limit, 복합 장애, 비용 vs 안정성 관점에서 생각해보세요'
            }
          ]
        }
      }
    }
  }
};
