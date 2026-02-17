var SCENARIO_LAB16 = {
  id: 'lab16-incident-workflow',
  title: 'Incident Workflow',
  difficulty: 'expert',

  alert: {
    severity: 'emergency',
    source: 'Datadog Composite Monitor',
    timestamp: '2026-02-14 19:18:40 KST',
    title: '[P1] Checkout failure + latency regression + error budget burn',
    message: '결제 성공률이 92%까지 하락했고 p99 지연이 6.8초로 증가했습니다. 1시간 error budget burn rate가 16.2x입니다.',
    metric: { name: 'checkout.success_rate', value: '92', unit: '%', threshold: '99.5' },
    tags: ['service:checkout', 'severity:p1', 'incident:open', 'customer_impact:high']
  },

  briefing: {
    description: '금요일 저녁 트래픽 피크 시간에 결제 시스템 장애가 발생했습니다. 기술적 원인 분석뿐 아니라 역할 분담, 커뮤니케이션, 의사결정 속도가 핵심입니다. 혼선을 줄이고 복구 시간을 단축하는 incident workflow를 실행하세요.',
    environment: {
      services: ['checkout-api', 'payment-adapter', 'order-service', 'support-portal'],
      infra: 'Kubernetes + Datadog + PagerDuty + Incident Channel',
      monitoring: 'Composite monitor + SLO burn monitor + customer support feed'
    }
  },

  optimalPath: ['step-1', 'step-2a', 'step-3a', 'step-4a', 'step-final'],

  scoring: {
    gradeThresholds: {
      S: { maxExtraSteps: 0, maxHints: 0, label: 'Crisis Leader' },
      A: { maxExtraSteps: 2, maxHints: 1, label: 'Reliable Incident Lead' },
      B: { maxExtraSteps: 4, maxHints: 2, label: 'Responding Engineer' },
      C: { maxExtraSteps: Infinity, maxHints: Infinity, label: 'Escalation Chaos' }
    }
  },

  steps: {
    'step-1': {
      title: 'Incident 선언과 역할 할당',
      description: '초기 10분이 핵심입니다. 현재 팀은 모두 기술 디버깅에만 몰려 있어 의사소통 혼선이 발생하고 있습니다. 먼저 incident command 구조를 세워야 합니다.',
      metrics: [
        {
          title: 'Business Impact Snapshot',
          chartType: 'line',
          chartConfig: {
            labels: ['19:00', '19:05', '19:10', '19:15', '19:20'],
            datasets: [
              {
                label: 'checkout success rate (%)',
                data: [99.4, 98.2, 95.6, 92.0, 93.1],
                borderColor: '#ef4444',
                backgroundColor: 'rgba(239, 68, 68, 0.15)',
                tension: 0.3,
                fill: true
              },
              {
                label: 'p99 latency (ms)',
                data: [850, 1300, 2800, 6800, 6200],
                borderColor: '#f59e0b',
                backgroundColor: 'rgba(245, 158, 11, 0.12)',
                tension: 0.3,
                fill: false
              }
            ]
          }
        }
      ],
      logs: [
        { timestamp: '19:11:09', level: 'ERROR', service: 'support', message: 'Payment failure complaints spiking (+220%)' },
        { timestamp: '19:12:21', level: 'WARN', service: 'oncall-chat', message: 'Multiple engineers applying changes without coordination' },
        { timestamp: '19:13:00', level: 'INFO', service: 'pagerduty', message: 'Primary oncall acknowledged P1' }
      ],
      choices: [
        {
          text: 'Incident 선언 후 IC/Comms/Ops 역할을 즉시 분리한다',
          isOptimal: true,
          feedback: '정확합니다. 역할 분리는 혼선을 줄이고 복구 속도를 높입니다.',
          nextStep: 'step-2a'
        },
        {
          text: '선언 없이 각자 디버깅을 계속한다',
          isOptimal: false,
          feedback: '지금은 기술보다 조정 실패가 더 큰 리스크입니다.',
          nextStep: 'step-2b-deadend'
        },
        {
          text: '모두에게 자유 조사만 요청한다',
          isOptimal: false,
          feedback: '탐색은 필요하지만 역할과 우선순위가 먼저 정리되어야 합니다.',
          nextStep: 'step-2c'
        }
      ],
      hint: 'P1에서는 기술 작업 이전에 command 구조를 세워야 합니다.'
    },

    'step-2a': {
      title: '영향 범위와 대응 전략 분리',
      description: 'IC가 상황을 정리했습니다. 결제 성공률 저하가 특정 카드사 결제 경로에 집중되고, 최근 배포된 retry 로직이 DB lock 경합을 유발한 정황이 있습니다. 이제 커뮤니케이션과 기술 대응을 병렬 진행해야 합니다.',
      metrics: [
        {
          title: 'Impact by Payment Route',
          chartType: 'bar',
          chartConfig: {
            labels: ['Card-A', 'Card-B', 'Wallet', 'Bank Transfer'],
            datasets: [
              {
                label: 'failure rate (%)',
                data: [14, 3, 2, 1],
                backgroundColor: ['#ef4444', '#f59e0b', '#3b82f6', '#10b981']
              }
            ]
          }
        }
      ],
      logs: [
        { timestamp: '19:20:40', level: 'INFO', service: 'incident-commander', message: 'Roles assigned: IC, Ops Lead, Comms Lead' },
        { timestamp: '19:21:03', level: 'WARN', service: 'db-observer', message: 'retry queue lock contention increased 5x after release v2026.02.14.3' },
        { timestamp: '19:21:20', level: 'INFO', service: 'comms', message: 'Customer status update draft prepared (15-min cadence)' }
      ],
      choices: [
        {
          text: '고객 커뮤니케이션 cadence를 시작하고 완화 조치를 병렬 실행한다',
          isOptimal: true,
          feedback: '좋습니다. P1에서는 외부 커뮤니케이션과 내부 복구를 동시에 진행해야 합니다.',
          nextStep: 'step-3a'
        },
        {
          text: '근본 원인 확정 전까지 고객 공지를 미룬다',
          isOptimal: false,
          feedback: '지연 공지는 신뢰 하락을 키웁니다. 불확실해도 현재 영향은 즉시 공유해야 합니다.',
          nextStep: 'step-3b'
        }
      ],
      hint: 'P1에서는 “정확성 100%”보다 “지연 없는 투명성”이 더 중요합니다.'
    },

    'step-2b-deadend': {
      title: '무조정 디버깅 지속 — Dead End',
      description: '동시에 3명이 서로 다른 핫픽스를 적용해 상태가 더 악화되었습니다. 로그가 뒤섞여 원인 추적도 어려워졌습니다. Incident command 없이 진행하면 복구가 지연됩니다.',
      isDeadEnd: true,
      metrics: [
        {
          title: 'Change Collision Count',
          chartType: 'bar',
          chartConfig: {
            labels: ['Before IC', 'After IC'],
            datasets: [
              {
                label: 'conflicting changes/hour',
                data: [5, 0],
                backgroundColor: ['#ef4444', '#10b981']
              }
            ]
          }
        }
      ],
      learningMoment: {
        title: 'P1에서 조정 실패는 기술 실패보다 치명적이다',
        explanation: '역할 분리(IC/Ops/Comms) 없이는 변경 충돌과 의사소통 지연이 반복됩니다.',
        moduleReference: 'Module 5: Incident Analysis'
      },
      redirectTo: 'step-1',
      redirectMessage: 'Incident command 구조부터 다시 세우세요.'
    },

    'step-2c': {
      title: '자유 조사 모드의 한계',
      description: '여러 단서가 수집되었지만 우선순위가 없어서 결정이 늦어집니다. 각자 분석은 유지하되 IC 중심 구조로 정렬해야 합니다.',
      metrics: [
        {
          title: 'Decision Latency',
          chartType: 'bar',
          chartConfig: {
            labels: ['Unstructured', 'Role-based'],
            datasets: [
              {
                label: 'time to decision (min)',
                data: [23, 7],
                backgroundColor: ['#f59e0b', '#10b981']
              }
            ]
          }
        }
      ],
      choices: [
        {
          text: 'IC 중심으로 역할과 우선순위를 재정렬한다',
          isOptimal: true,
          feedback: '좋은 선택입니다. 구조화된 워크플로우가 복구 속도를 높입니다.',
          nextStep: 'step-2a'
        }
      ],
      hint: '문제 발견과 문제 해결은 다릅니다. 의사결정 구조가 필요합니다.'
    },

    'step-3a': {
      title: '완화 전략 선택: 롤백 vs 핫픽스',
      description: 'Ops Lead가 원인 후보를 좁혔습니다. 새 retry 로직 롤백이 가장 빠른 안정화 경로로 보입니다. 동시에 Comms Lead는 15분 간격 상태 공지를 시작했습니다.',
      metrics: [
        {
          title: 'Mitigation Option Risk Matrix',
          chartType: 'bar',
          chartConfig: {
            labels: ['rollback', 'direct hotfix'],
            datasets: [
              {
                label: 'estimated recovery time (min)',
                data: [12, 38],
                backgroundColor: ['#10b981', '#ef4444']
              },
              {
                label: 'execution risk score',
                data: [2, 8],
                backgroundColor: ['#3b82f6', '#f59e0b']
              }
            ]
          }
        }
      ],
      logs: [
        { timestamp: '19:31:02', level: 'INFO', service: 'comms', message: 'Status page updated: checkout degradation under investigation' },
        { timestamp: '19:31:40', level: 'WARN', service: 'ops', message: 'rollback candidate identified: release v2026.02.14.3' },
        { timestamp: '19:32:14', level: 'INFO', service: 'ic', message: 'Decision gate opened: rollback-first strategy' }
      ],
      choices: [
        {
          text: '롤백을 카나리로 실행하고 지표 회복을 확인한다',
          isOptimal: true,
          feedback: '정확한 결정입니다. P1에서는 검증된 저위험 완화가 우선입니다.',
          nextStep: 'step-4a'
        },
        {
          text: '검증 없이 직접 핫픽스를 전체 반영한다',
          isOptimal: false,
          feedback: '고위험 변경은 P1 상황에서 추가 사고를 유발할 수 있습니다.',
          nextStep: 'step-3c-deadend'
        }
      ],
      hint: '고객 영향이 큰 상황에서는 가장 빠르고 안전한 완화 경로를 선택하세요.'
    },

    'step-3b': {
      title: '공지 지연으로 신뢰 저하',
      description: '원인 확정까지 공지를 미루는 동안 고객 문의가 폭증하고 영업팀 escalations가 발생했습니다. 기술 복구와 별개로 신뢰 손실이 커졌습니다.',
      metrics: [
        {
          title: 'Communication Delay Impact',
          chartType: 'line',
          chartConfig: {
            labels: ['+0m', '+10m', '+20m', '+30m', '+40m'],
            datasets: [
              {
                label: 'support escalations',
                data: [3, 7, 16, 29, 34],
                borderColor: '#ef4444',
                backgroundColor: 'rgba(239, 68, 68, 0.14)',
                tension: 0.3,
                fill: true
              }
            ]
          }
        }
      ],
      choices: [
        {
          text: '즉시 정기 공지를 시작하고 완화 작업을 병렬 진행한다',
          isOptimal: true,
          feedback: '좋습니다. 불확실해도 현재 영향과 다음 업데이트 시간을 공유해야 합니다.',
          nextStep: 'step-3a'
        }
      ],
      hint: 'P1 커뮤니케이션은 완성된 원인 설명보다 빠른 상태 공유가 우선입니다.'
    },

    'step-3c-deadend': {
      title: '무검증 핫픽스 적용 — Dead End',
      description: '핫픽스가 새로운 null-reference 오류를 일으켜 결제 실패율이 18%까지 악화되었습니다. incident 중 고위험 변경은 반드시 제한해야 합니다.',
      isDeadEnd: true,
      learningMoment: {
        title: 'Incident 중에는 리스크 최소화가 최우선이다',
        explanation: '근본 수정은 복구 후 진행하고, incident 중에는 rollback/feature flag 같은 저위험 완화를 우선 선택하세요.',
        moduleReference: 'Module 6: Dashboard Design (decision support)'
      },
      redirectTo: 'step-3a',
      redirectMessage: '저위험 완화 전략으로 다시 결정하세요.'
    },

    'step-4a': {
      title: '복구 확인 및 종료 준비',
      description: '카나리 롤백 후 성공률과 지연이 회복되었고, 점진적으로 전체 트래픽에 확장해 안정화했습니다. 이제 incident 종료 조건과 사후 작업을 정리합니다.',
      metrics: [
        {
          title: 'Recovery Trend',
          chartType: 'line',
          chartConfig: {
            labels: ['19:35', '19:40', '19:45', '19:50', '19:55', '20:00'],
            datasets: [
              {
                label: 'success rate (%)',
                data: [93, 95, 97.2, 98.4, 99.1, 99.4],
                borderColor: '#10b981',
                backgroundColor: 'rgba(16, 185, 129, 0.14)',
                tension: 0.3,
                fill: true
              },
              {
                label: 'p99 latency (ms)',
                data: [6200, 4100, 2200, 1400, 980, 860],
                borderColor: '#3b82f6',
                backgroundColor: 'rgba(59, 130, 246, 0.1)',
                tension: 0.3,
                fill: false
              }
            ]
          }
        }
      ],
      logs: [
        { timestamp: '19:44:11', level: 'INFO', service: 'ops', message: 'canary rollback successful, no regression detected' },
        { timestamp: '19:50:23', level: 'INFO', service: 'incident-commander', message: 'traffic rollout completed to 100%' },
        { timestamp: '19:55:00', level: 'INFO', service: 'comms', message: 'status page updated: service recovered, monitoring in progress' }
      ],
      choices: [
        {
          text: 'post-incident review와 액션 아이템을 오너/기한과 함께 등록한다',
          isOptimal: true,
          feedback: '완벽합니다. 복구 이후 재발 방지까지 연결해야 workflow가 완성됩니다.',
          nextStep: 'step-final'
        },
        {
          text: '원인 기록 없이 incident를 즉시 닫는다',
          isOptimal: false,
          feedback: '사후 분석이 없으면 동일 패턴 장애가 반복됩니다.',
          nextStep: 'step-4b-deadend'
        }
      ],
      hint: 'Incident 종료 조건에는 기술 회복 + 커뮤니케이션 정리 + follow-up 등록이 포함됩니다.'
    },

    'step-4b-deadend': {
      title: '사후 작업 누락 — Dead End',
      description: '한 달 후 동일 retry 로직이 다시 배포되어 유사 장애가 재발했습니다. post-incident action item이 없으면 조직 학습이 일어나지 않습니다.',
      isDeadEnd: true,
      learningMoment: {
        title: 'Incident workflow의 마지막은 학습과 개선이다',
        explanation: '복구만으로 종료하면 재발률이 높습니다. 원인, 교훈, 실행 항목을 반드시 남겨야 합니다.',
        moduleReference: 'Module 5: Incident Analysis'
      },
      redirectTo: 'step-4a',
      redirectMessage: '사후 개선 항목까지 완료하고 incident를 종료하세요.'
    },

    'step-final': {
      title: 'Incident Workflow 완수',
      description: '역할 기반 대응, 병렬 커뮤니케이션, 저위험 완화 전략, 사후 개선 등록까지 완료했습니다. 이 워크플로우는 복구 속도뿐 아니라 조직 신뢰도를 유지하는 핵심 운영 자산입니다.',
      isTerminal: true,
      rootCause: {
        title: 'Retry logic regression + unstructured response risk',
        summary: '신규 retry 로직이 lock 경합을 유발해 결제 실패율이 급증했고, 초기에는 역할 분리 부재로 혼선이 확대될 위험이 있었습니다. IC 구조와 rollback 전략으로 빠르게 안정화했습니다.',
        timeline: [
          { time: '19:18', event: 'P1 alert fired (success rate 92%)' },
          { time: '19:20', event: 'Incident command roles assigned' },
          { time: '19:31', event: 'Rollback-first mitigation selected' },
          { time: '19:44', event: 'Canary rollback verified' },
          { time: '19:55', event: 'Service recovered + customer comm finalized' }
        ],
        resolution: [
          'IC/Ops/Comms 역할 분리와 단일 decision channel 운영',
          '15분 cadence 상태 공지와 고객 영향 투명 공유',
          '고위험 핫픽스 대신 rollback-first 전략 적용',
          'Post-incident review + owner/due-date action tracking',
          '배포 전 retry logic load-test gate 추가'
        ]
      },
      postMortem: {
        template: {
          fields: [
            {
              id: 'incident-roles',
              label: '다음 P1에서 즉시 선언할 역할 3가지를 적어보세요.',
              type: 'textarea',
              placeholder: 'Incident Commander, Ops Lead, Comms Lead',
              hint: '역할 이름 + 핵심 책임을 함께 적어도 좋습니다.'
            },
            {
              id: 'prevention-actions',
              label: '이번 incident에서 재발 방지 액션 2개를 정의하세요.',
              type: 'textarea',
              placeholder: 'retry logic pre-release load test, rollback playbook automation',
              hint: '실행 오너와 기한을 함께 정의하는 습관이 중요합니다.'
            }
          ]
        },
        rubric: {
          criteria: [
            {
              id: 'criteria-incident-roles',
              label: '사건 대응 역할이 역할별로 구분되었는가',
              points: 55,
              fieldIds: ['incident-roles'],
              keywords: ['incident commander', 'ops', 'comms', 'ic', '역할', '책임'],
              match: 'any',
              minMatch: 2
            },
            {
              id: 'criteria-prevention-actions',
              label: '재발 방지 액션이 오너와 기한 관점으로 제시되었는가',
              points: 45,
              fieldIds: ['prevention-actions'],
              keywords: ['owner', '오너', 'due', '기한', '재발', '액션', '방지'],
              match: 'any',
              minMatch: 2
            }
          ]
        }
      }
    }
  }
};