/**
 * Lab 3: Memory Leak OOMKill 장애 시나리오
 *
 * 상황: 수요일 새벽 3시, notification-service Pod들이 주기적으로 재시작되는 알림 발생.
 * 근본 원인: WebSocket 핸들러가 연결 해제 시 이벤트 리스너를 해제하지 않아 JVM 힙 메모리 누수 → OOMKill.
 */
var SCENARIO_LAB3 = {
  id: 'lab3-memory-leak-oomkill',
  title: 'Memory Leak OOMKill 장애',
  difficulty: 'advanced',

  alert: {
    severity: 'critical',
    source: 'Datadog Monitor',
    timestamp: '2024-04-17 03:12:18 KST',
    title: '[P1] notification-service Pod 반복 재시작',
    message: 'notification-service Pod들이 주기적으로 재시작되고 있습니다. 최근 1시간 동안 총 8회 재시작이 감지되었으며, 사용자 알림 배달 실패율이 12%까지 증가했습니다.',
    metric: {
      name: 'kube.pod.restart_count',
      value: '8',
      unit: 'restarts/hour',
      threshold: '2'
    },
    tags: ['service:notification-service', 'env:production', 'region:ap-northeast-2', 'severity:p1']
  },

  briefing: {
    description: '수요일 새벽 3시, PagerDuty에서 P1 알림이 발생했습니다. notification-service의 Pod들이 주기적으로 재시작되고 있으며, 사용자들이 푸시 알림과 이메일을 받지 못하고 있다는 보고가 들어오고 있습니다. 당신은 온콜 엔지니어로서 이 장애를 조사해야 합니다.',
    environment: {
      services: ['notification-service (Spring Boot + WebSocket)', 'user-service', 'order-service', 'kafka-cluster'],
      infra: 'EKS (5 nodes), RDS PostgreSQL, Kafka MSK, ElastiCache Redis',
      monitoring: 'Datadog APM + Kubernetes Integration + JVM Metrics'
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
    // ============================================================
    // Step 1: 초기 알림 확인 - Pod restart 및 notification failure
    // ============================================================
    'step-1': {
      title: '초기 알림 확인',
      description: 'Datadog Kubernetes 대시보드에서 notification-service의 상태를 확인합니다. Pod restart count가 계단식으로 증가하고 있으며, 알림 배달 실패율도 동시에 급증하고 있습니다.',
      metrics: [
        {
          title: 'notification-service Pod Restart Count',
          chartType: 'line',
          chartConfig: {
            labels: ['02:00', '02:15', '02:30', '02:45', '03:00', '03:15'],
            datasets: [{
              label: 'Restart Count',
              data: [0, 1, 2, 4, 6, 8],
              borderColor: '#f87171',
              backgroundColor: 'rgba(248, 113, 113, 0.1)',
              fill: true,
              stepped: true
            }]
          }
        },
        {
          title: 'Notification Delivery Failure Rate (%)',
          chartType: 'line',
          chartConfig: {
            labels: ['02:00', '02:15', '02:30', '02:45', '03:00', '03:15'],
            datasets: [{
              label: 'Failure Rate %',
              data: [0.2, 1.5, 3.2, 7.8, 11.2, 12.4],
              borderColor: '#ef4444',
              backgroundColor: 'rgba(239, 68, 68, 0.2)',
              fill: true,
              tension: 0.3
            }]
          }
        }
      ],
      logs: [
        { timestamp: '03:12:18', level: 'ERROR', source: 'kubernetes', message: 'Pod notification-service-7d9f8c6b5-abc12 terminated - Reason: OOMKilled, Exit Code: 137' },
        { timestamp: '03:10:45', level: 'ERROR', source: 'kubernetes', message: 'Pod notification-service-7d9f8c6b5-def34 terminated - Reason: OOMKilled, Exit Code: 137' },
        { timestamp: '03:08:22', level: 'ERROR', source: 'kubernetes', message: 'Pod notification-service-7d9f8c6b5-ghi56 terminated - Reason: OOMKilled, Exit Code: 137' },
        { timestamp: '03:12:15', level: 'WARN', source: 'notification-service', message: 'Failed to deliver notification to user_id=12847 - Connection reset by peer' },
        { timestamp: '03:12:10', level: 'INFO', source: 'kubernetes', message: 'Pod notification-service-7d9f8c6b5-abc12 restarted (restart count: 8)' }
      ],
      hint: 'OOMKilled는 컨테이너가 메모리 limit을 초과하여 강제 종료되었다는 의미입니다. Pod가 재시작된 후 일시적으로 복구되지만 다시 OOMKill이 발생하는 패턴을 보면, 메모리 누수가 의심됩니다. Pod 메모리 사용 패턴을 자세히 분석해야 합니다.',
      choices: [
        {
          text: 'Pod 메모리 사용량 상세 분석 (container_memory_working_set_bytes, JVM heap)',
          isOptimal: true,
          feedback: '정확한 판단입니다! OOMKilled 로그가 명확하므로 메모리 사용 패턴을 분석하여 누수 여부를 확인하는 것이 핵심입니다.',
          nextStep: 'step-2a'
        },
        {
          text: 'notification-service 애플리케이션 로그 분석',
          isOptimal: false,
          feedback: '애플리케이션 로그도 중요하지만, OOMKilled는 메모리 문제이므로 먼저 메모리 메트릭을 확인하는 것이 더 효율적입니다.',
          nextStep: 'step-2b'
        },
        {
          text: 'Kafka consumer lag 확인',
          isOptimal: false,
          feedback: 'Kafka lag는 알림 실패의 부수적 증상일 수 있지만, 근본 원인은 OOMKill입니다. 메모리 문제를 먼저 해결해야 합니다.',
          nextStep: 'step-2c'
        }
      ]
    },

    // ============================================================
    // Step 2a: K8s 메모리 분석 (최적 경로)
    // ============================================================
    'step-2a': {
      title: 'Kubernetes 메모리 메트릭 분석',
      description: 'Datadog에서 notification-service의 컨테이너 메모리 사용량을 확인합니다. 톱니 패턴(sawtooth pattern)이 명확하게 보입니다 - 메모리가 점진적으로 증가하다가 limit(2Gi)에 도달하면 OOMKill로 급감하고, 재시작 후 다시 증가하는 패턴이 반복됩니다.',
      metrics: [
        {
          title: 'Container Memory Working Set (bytes)',
          chartType: 'line',
          chartConfig: {
            labels: ['02:00', '02:15', '02:30', '02:45', '03:00', '03:15', '03:30'],
            datasets: [{
              label: 'Memory Usage (GB)',
              data: [0.4, 0.8, 1.2, 1.6, 1.95, 0.35, 0.75],
              borderColor: '#f97316',
              backgroundColor: 'rgba(249, 115, 22, 0.1)',
              fill: true,
              tension: 0.2
            }, {
              label: 'Memory Limit (2Gi)',
              data: [2.0, 2.0, 2.0, 2.0, 2.0, 2.0, 2.0],
              borderColor: '#ef4444',
              borderDash: [8, 4],
              borderWidth: 2,
              pointRadius: 0,
              fill: false
            }]
          }
        },
        {
          title: 'JVM Heap Memory Used (MB)',
          chartType: 'line',
          chartConfig: {
            labels: ['02:00', '02:15', '02:30', '02:45', '03:00', '03:15', '03:30'],
            datasets: [{
              label: 'Heap Used (MB)',
              data: [320, 620, 920, 1220, 1520, 280, 580],
              borderColor: '#a78bfa',
              backgroundColor: 'rgba(167, 139, 250, 0.1)',
              fill: true,
              tension: 0.2
            }, {
              label: 'Heap Max (1536 MB)',
              data: [1536, 1536, 1536, 1536, 1536, 1536, 1536],
              borderColor: '#8b5cf6',
              borderDash: [5, 5],
              borderWidth: 1,
              pointRadius: 0,
              fill: false
            }]
          }
        }
      ],
      logs: [
        { timestamp: '03:14:00', level: 'WARN', source: 'jvm-metrics', message: 'notification-service JVM: heap used 1520 MB / 1536 MB (99%), Full GC triggered' },
        { timestamp: '03:13:50', level: 'INFO', source: 'kubernetes', message: 'container_memory_working_set_bytes: 2.05 GB (exceeds limit 2.0 GB) - OOMKill triggered' },
        { timestamp: '03:13:40', level: 'WARN', source: 'jvm-gc', message: 'Full GC completed in 3.2s, freed only 45 MB (heap still at 98%)' },
        { timestamp: '03:13:20', level: 'WARN', source: 'jvm-gc', message: 'Full GC frequency increased: 8 Full GC events in last 10 minutes' },
        { timestamp: '03:00:00', level: 'INFO', source: 'kubernetes', message: 'Pod restarted after OOMKill, memory usage reset to 350 MB' }
      ],
      hint: '메모리가 계속 증가하고 Full GC를 실행해도 회수되지 않는다면 메모리 누수입니다. JVM 힙 덤프를 분석하여 어떤 객체가 메모리를 점유하고 있는지 확인해야 합니다.',
      choices: [
        {
          text: 'JVM 힙 덤프 분석 + GC 로그 확인',
          isOptimal: true,
          feedback: '완벽합니다! 힙 덤프를 분석하면 어떤 객체가 메모리를 점유하고 있는지 확인할 수 있습니다. Full GC로도 회수되지 않는 객체를 찾아야 합니다.',
          nextStep: 'step-3a'
        },
        {
          text: 'Pod memory limits를 2Gi → 4Gi로 증가',
          isOptimal: false,
          isDeadEnd: true,
          feedback: 'limit을 올려도 메모리 누수가 해결되지 않으므로 결국 다시 OOMKill이 발생합니다. 근본 원인을 찾아야 합니다.',
          nextStep: 'step-3b-deadend'
        }
      ]
    },

    // ============================================================
    // Step 2b: 애플리케이션 로그 분석 (비최적 - 리다이렉트)
    // ============================================================
    'step-2b': {
      title: 'notification-service 로그 분석',
      description: '애플리케이션 로그를 확인합니다. WebSocket 연결/해제 로그가 많이 보이지만, 명확한 에러는 보이지 않습니다. OOMKill 직전의 로그는 재시작으로 인해 손실되었습니다.',
      logs: [
        { timestamp: '03:09:50', level: 'INFO', source: 'notification-service', message: 'WebSocket connection established: session_id=ws-12847' },
        { timestamp: '03:09:48', level: 'INFO', source: 'notification-service', message: 'WebSocket connection closed: session_id=ws-12842' },
        { timestamp: '03:09:45', level: 'INFO', source: 'notification-service', message: 'WebSocket connection established: session_id=ws-12846' },
        { timestamp: '03:09:40', level: 'INFO', source: 'notification-service', message: 'Notification sent to user_id=5842 via FCM' },
        { timestamp: '03:09:35', level: 'WARN', source: 'notification-service', message: '로그가 재시작으로 인해 불완전함 - 메모리 메트릭을 먼저 확인 필요' }
      ],
      choices: [
        {
          text: '이전 단계로 돌아가서 메모리 메트릭 분석',
          isOptimal: true,
          feedback: 'OOMKill 문제는 메모리 메트릭을 먼저 확인하는 것이 효율적입니다.',
          nextStep: 'step-1'
        }
      ]
    },

    // ============================================================
    // Step 2c: Kafka lag 확인 (비최적 - 리다이렉트)
    // ============================================================
    'step-2c': {
      title: 'Kafka Consumer Lag 확인',
      description: 'Kafka consumer lag를 확인합니다. notification-topic의 lag가 약간 증가했지만, 이는 Pod 재시작으로 인한 부수 효과입니다. 근본 원인은 OOMKill입니다.',
      logs: [
        { timestamp: '03:13:00', level: 'INFO', source: 'kafka', message: 'notification-topic consumer lag: 248 messages (평소 대비 약간 증가)' },
        { timestamp: '03:13:00', level: 'INFO', source: 'kafka', message: 'consumer group "notification-service-group" - 2 active consumers' },
        { timestamp: '03:13:01', level: 'WARN', source: 'kafka', message: 'consumer rebalance detected - Pod 재시작으로 인한 일시적 현상' }
      ],
      choices: [
        {
          text: '이전 단계로 돌아가서 OOMKill 원인 분석',
          isOptimal: true,
          feedback: 'Kafka lag는 결과이지 원인이 아닙니다. OOMKill을 해결해야 합니다.',
          nextStep: 'step-1'
        }
      ]
    },

    // ============================================================
    // Step 3a: 힙 덤프 분석 (최적 경로)
    // ============================================================
    'step-3a': {
      title: 'JVM 힙 덤프 분석',
      description: 'OOMKill 직전의 힙 덤프를 분석합니다. EventListener 객체들이 비정상적으로 많이 누적되어 있으며, 총 메모리의 78%를 차지하고 있습니다. GC 로그를 보면 Full GC 빈도가 계속 증가하지만 회수되는 메모리는 거의 없습니다.',
      metrics: [
        {
          title: 'Heap Memory by Object Type (Top 5)',
          chartType: 'bar',
          chartConfig: {
            labels: ['EventListener', 'WebSocketSession', 'HashMap$Node', 'String', 'byte[]'],
            datasets: [{
              label: 'Memory (MB)',
              data: [1187, 145, 78, 52, 38],
              backgroundColor: [
                'rgba(239, 68, 68, 0.7)',
                'rgba(251, 191, 36, 0.6)',
                'rgba(99, 102, 241, 0.5)',
                'rgba(139, 92, 246, 0.4)',
                'rgba(107, 114, 128, 0.4)'
              ],
              borderColor: ['#ef4444', '#fbbf24', '#6366f1', '#8b5cf6', '#6b7280'],
              borderWidth: 1
            }]
          }
        },
        {
          title: 'Full GC Frequency (events/min)',
          chartType: 'line',
          chartConfig: {
            labels: ['02:00', '02:15', '02:30', '02:45', '03:00', '03:15'],
            datasets: [{
              label: 'Full GC Events',
              data: [0.5, 1.2, 2.8, 5.2, 8.4, 12.1],
              borderColor: '#f87171',
              backgroundColor: 'rgba(248, 113, 113, 0.2)',
              fill: true,
              tension: 0.3
            }]
          }
        }
      ],
      logs: [
        { timestamp: '03:15:00', level: 'ERROR', source: 'heap-dump-analyzer', message: 'Top memory consumer: com.example.notification.websocket.EventListener - 14,285 instances, 1187 MB (78% of heap)' },
        { timestamp: '03:15:00', level: 'WARN', source: 'heap-dump-analyzer', message: 'EventListener objects are not being garbage collected - likely holding strong references' },
        { timestamp: '03:15:01', level: 'INFO', source: 'heap-dump-analyzer', message: 'GC Root analysis: EventListener instances referenced by WebSocketMessageHandler.listenerMap' },
        { timestamp: '03:15:02', level: 'INFO', source: 'code-analysis', message: '최근 배포(v2.3.0, 2024-04-15): "WebSocket 핸들러 리팩토링 - 이벤트 기반 아키텍처 도입"' },
        { timestamp: '03:15:03', level: 'WARN', source: 'gc-log', message: 'Full GC (Ergonomics): 1520M -> 1475M (freed only 45 MB in 3.2s) - GC ineffective' }
      ],
      hint: 'EventListener 객체가 WebSocketMessageHandler에 강한 참조로 연결되어 있어 GC되지 않고 있습니다. 최근 배포에서 WebSocket 핸들러를 변경했으므로, 코드에서 연결 해제 시 리스너를 제거하지 않는 버그가 있을 가능성이 높습니다.',
      choices: [
        {
          text: '최근 배포 코드 변경점 확인 + WebSocket 핸들러 분석',
          isOptimal: true,
          feedback: '정확합니다! 힙 덤프에서 EventListener가 원인임을 확인했으므로, 최근 배포된 WebSocket 핸들러 코드를 분석하여 리스너 해제 누락을 찾아야 합니다.',
          nextStep: 'step-4a'
        },
        {
          text: 'GC 알고리즘 변경 (G1GC → ZGC)',
          isOptimal: false,
          isDeadEnd: true,
          feedback: 'GC 알고리즘을 바꿔도 메모리 누수는 해결되지 않습니다. 객체가 강한 참조로 연결되어 있어 어떤 GC도 회수할 수 없습니다.',
          nextStep: 'step-3c-deadend'
        }
      ]
    },

    // ============================================================
    // Step 3b: Dead End - Memory Limit 증가
    // ============================================================
    'step-3b-deadend': {
      title: '막다른 길: Memory Limit 증가',
      isDeadEnd: true,
      description: 'Pod의 memory limit을 2Gi → 4Gi로 증가시켰습니다. 초기에는 OOMKill이 발생하지 않지만, 2시간 후 메모리가 다시 4Gi에 도달하여 OOMKill이 재발했습니다. 메모리 누수가 해결되지 않았기 때문에 결국 같은 문제가 반복됩니다.',
      learningMoment: {
        title: 'Memory Limit 증가가 해결책이 아닌 이유',
        explanation: '메모리 누수는 시간이 지남에 따라 계속 메모리를 소비합니다. Limit을 늘리면 OOMKill까지 걸리는 시간이 길어질 뿐, 결국 같은 문제가 발생합니다. 게다가 limit을 무분별하게 올리면 노드의 전체 메모리를 고갈시켜 다른 Pod까지 영향을 줄 수 있습니다. 근본 원인인 메모리 누수를 찾아 코드를 수정해야 합니다.',
        moduleReference: 'Module 4: Kubernetes 모니터링에서 리소스 limit 설정 전략을 복습하세요.'
      },
      redirectTo: 'step-2a',
      redirectMessage: '메모리 메트릭으로 돌아가서 근본 원인 분석'
    },

    // ============================================================
    // Step 3c: Dead End - GC 알고리즘 변경
    // ============================================================
    'step-3c-deadend': {
      title: '막다른 길: GC 알고리즘 변경',
      isDeadEnd: true,
      description: 'JVM GC 알고리즘을 G1GC에서 ZGC로 변경했습니다. GC pause 시간은 약간 개선되었지만, 메모리 누수는 여전히 발생하며 OOMKill도 계속됩니다. GC 알고리즘은 메모리 회수 방식을 바꿀 뿐, 강한 참조로 연결된 객체는 어떤 GC로도 회수할 수 없습니다.',
      learningMoment: {
        title: 'GC 알고리즘은 메모리 누수를 해결하지 못함',
        explanation: 'GC(Garbage Collector)는 더 이상 참조되지 않는 객체만 회수합니다. EventListener 객체들이 WebSocketMessageHandler에 강한 참조로 연결되어 있으므로, GC는 이들을 "사용 중"으로 판단하여 회수하지 않습니다. G1GC, ZGC, Shenandoah 등 어떤 GC 알고리즘을 사용하든 결과는 동일합니다. 메모리 누수는 코드 수준에서 해결해야 합니다.',
        moduleReference: 'Module 2: Spring Boot 모니터링에서 JVM 메모리 구조를 복습하세요.'
      },
      redirectTo: 'step-3a',
      redirectMessage: '힙 덤프 분석으로 돌아가기'
    },

    // ============================================================
    // Step 4a: 코드 분석 및 핫픽스 (최적 경로)
    // ============================================================
    'step-4a': {
      title: '코드 분석 및 긴급 패치',
      description: '최근 배포(v2.3.0)의 코드 diff를 확인합니다. WebSocket disconnect 핸들러에서 addEventListener()는 호출하지만 removeEventListener()를 호출하지 않아, 연결이 해제될 때마다 EventListener 객체가 메모리에 누적되고 있었습니다.',
      metrics: [
        {
          title: '핫픽스 배포 후 메모리 안정화',
          chartType: 'line',
          chartConfig: {
            labels: ['03:30', '03:45', '04:00', '04:15', '04:30', '04:45', '05:00'],
            datasets: [{
              label: 'Memory Usage (GB) - Before Fix',
              data: [0.75, 1.15, 1.55, 1.95, null, null, null],
              borderColor: '#f87171',
              backgroundColor: 'rgba(248, 113, 113, 0.1)',
              borderDash: [5, 5],
              fill: true,
              tension: 0.2
            }, {
              label: 'Memory Usage (GB) - After Fix',
              data: [null, null, null, 0.45, 0.52, 0.48, 0.51],
              borderColor: '#4ade80',
              backgroundColor: 'rgba(74, 222, 128, 0.1)',
              fill: true,
              tension: 0.2
            }, {
              label: 'Memory Limit (2Gi)',
              data: [2.0, 2.0, 2.0, 2.0, 2.0, 2.0, 2.0],
              borderColor: '#6b7280',
              borderDash: [8, 4],
              borderWidth: 1,
              pointRadius: 0,
              fill: false
            }]
          }
        }
      ],
      logs: [
        { timestamp: '03:45:00', level: 'INFO', source: 'git-diff', message: 'v2.3.0 변경사항: WebSocketMessageHandler.java - onDisconnect() 메서드에서 removeEventListener() 호출 누락' },
        { timestamp: '03:45:01', level: 'ERROR', source: 'code-review', message: 'BUG: this.eventBus.addEventListener(listener); called but never removed on disconnect' },
        { timestamp: '03:45:02', level: 'INFO', source: 'code-review', message: 'Fix: onDisconnect() 메서드에 this.eventBus.removeEventListener(session.getId()); 추가' },
        { timestamp: '04:05:00', level: 'INFO', source: 'argocd', message: 'Hotfix v2.3.1 deployed - removeEventListener 누락 수정' },
        { timestamp: '04:15:00', level: 'INFO', source: 'kubernetes', message: 'notification-service Pods stable - no restarts in last 30 minutes' },
        { timestamp: '04:20:00', level: 'INFO', source: 'jvm-metrics', message: 'Heap usage stabilized at ~520 MB (34%), Full GC frequency normalized to 0.3 events/min' }
      ],
      hint: '핫픽스를 배포하여 즉시 대응이 완료되었습니다. 이제 재발 방지를 위한 항구적 대책을 수립해야 합니다.',
      choices: [
        {
          text: '재발 방지: 메모리 알림 강화 + JVM 메트릭 모니터링 + 코드 리뷰 체크리스트 추가',
          isOptimal: true,
          feedback: '완벽합니다! 메모리 누수를 조기에 탐지할 수 있도록 모니터링을 강화하고, 코드 리뷰에서 리소스 해제를 반드시 확인하도록 프로세스를 개선합니다.',
          nextStep: 'step-final'
        }
      ]
    },

    // ============================================================
    // Step Final: 근본 원인 및 Post-mortem
    // ============================================================
    'step-final': {
      title: '조사 완료',
      isTerminal: true,
      rootCause: {
        title: 'WebSocket EventListener 메모리 누수 → OOMKill',
        summary: '최근 배포(v2.3.0)에서 도입된 WebSocket 핸들러가 연결 해제 시 addEventListener()로 등록한 EventListener를 removeEventListener()로 해제하지 않아, 연결이 끊길 때마다 EventListener 객체가 메모리에 누적되었습니다. JVM 힙 메모리가 점진적으로 증가하여 container memory limit(2Gi)에 도달하면 OOMKill이 발생하고, Pod가 재시작된 후 다시 같은 패턴이 반복되었습니다.',
        timeline: [
          { time: '04-15 14:00', event: 'notification-service v2.3.0 배포 (WebSocket 핸들러 리팩토링)' },
          { time: '04-17 01:00', event: '메모리 사용량 증가 시작 (400 MB → 서서히 증가)' },
          { time: '04-17 02:30', event: '첫 번째 OOMKill 발생, Pod 재시작' },
          { time: '04-17 02:45', event: '두 번째 OOMKill - restart count 증가 시작' },
          { time: '04-17 03:12', event: 'P1 알림 발생: Pod 반복 재시작 (총 8회)' },
          { time: '04-17 03:13', event: '온콜 엔지니어 대응 시작' },
          { time: '04-17 03:45', event: '힙 덤프 분석 완료, 코드 버그 확인' },
          { time: '04-17 04:05', event: '핫픽스 v2.3.1 배포 (removeEventListener 추가)' },
          { time: '04-17 04:30', event: '메모리 안정화 확인, 서비스 정상 복구' }
        ],
        resolution: [
          '즉시 대응: 핫픽스 v2.3.1 배포 - onDisconnect()에 removeEventListener() 추가',
          '단기 대책: 메모리 사용률 80% 초과 시 알림 추가, JVM heap used > 90% 알림 추가',
          '중기 대책: Full GC 빈도 급증(> 5 events/min) 감지 알림 추가',
          '장기 대책: 코드 리뷰 체크리스트에 "리소스 해제 검증" 항목 추가 (addEventListener/removeEventListener, subscription/unsubscribe 등)',
          '모니터링: Heap dump 자동 수집 (OOMKill 직전), heap histogram 주기적 분석'
        ]
      },
      postMortem: {
        template: {
          fields: [
            {
              label: '1. 장애 요약 (한 줄)',
              placeholder: '예: WebSocket EventListener 메모리 누수로 인한 notification-service OOMKill 반복 재시작'
            },
            {
              label: '2. 영향 범위',
              placeholder: '예: notification-service 전체, 약 1시간 30분간 알림 배달 실패율 12% (푸시, 이메일)'
            },
            {
              label: '3. 탐지 방법과 개선점',
              placeholder: '예: Pod restart count 알림으로 탐지. 개선: 메모리 사용률 및 Full GC 빈도 알림 추가로 OOMKill 전 조기 탐지'
            },
            {
              label: '4. 근본 원인',
              placeholder: '예: WebSocket disconnect 시 removeEventListener() 호출 누락으로 EventListener 객체 누적'
            },
            {
              label: '5. 재발 방지 계획',
              placeholder: '예: 코드 리뷰에서 리소스 해제 검증 필수화, JVM 메모리 모니터링 강화, heap dump 자동 수집'
            }
          ]
        }
      }
    }
  }
};
