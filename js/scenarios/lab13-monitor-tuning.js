var SCENARIO_LAB13 = {
  id: 'lab13-monitor-tuning',
  title: 'Monitor Tuning',
  difficulty: 'advanced',

  alert: {
    severity: 'critical',
    source: 'Datadog Monitor',
    timestamp: '2026-02-11 09:12:18 KST',
    title: '[P2] checkout-api error-rate monitor flapping',
    message: '지난 2시간 동안 checkout-api 에러율 모니터가 16회 알림을 보냈지만 실제 고객 영향은 1건만 확인되었습니다.',
    metric: { name: 'monitor.flap.count', value: '16', unit: 'alerts/2h', threshold: '3' },
    tags: ['service:checkout-api', 'env:prod', 'team:payments', 'monitor_type:metric']
  },

  briefing: {
    description: '결제팀 온콜이 알림 피로를 호소하고 있습니다. 최근 배포 이후 트래픽이 들쭉날쭉해지면서 에러율 모니터가 노이즈를 대량 발생시키는 상황입니다. 실제 장애를 놓치지 않으면서 오탐을 줄이는 튜닝이 필요합니다.',
    environment: {
      services: ['checkout-api', 'payment-gateway-adapter', 'fraud-checker'],
      infra: 'Kubernetes + Datadog APM/Logs/Monitors',
      monitoring: 'Error-rate metric monitor, anomaly monitor, on-call paging'
    }
  },

  optimalPath: ['step-1', 'step-2a', 'step-3a', 'step-4a', 'step-final'],

  scoring: {
    gradeThresholds: {
      S: { maxExtraSteps: 0, maxHints: 0, label: 'Staff On-call' },
      A: { maxExtraSteps: 2, maxHints: 1, label: 'Senior Engineer' },
      B: { maxExtraSteps: 4, maxHints: 2, label: 'SRE in Training' },
      C: { maxExtraSteps: Infinity, maxHints: Infinity, label: 'Needs Coaching' }
    }
  },

  steps: {
    'step-1': {
      title: '알림 폭주 탐지',
      description: '모니터 이벤트 히스토리를 열어보니 2시간 동안 16회 알림이 발생했습니다. 하지만 Incident 타임라인에서는 실제 고객 영향이 1회만 확인됩니다. 먼저 신호 품질을 계량화해야 합니다.',
      metrics: [
        {
          title: 'Alert Count vs Real Incidents (2h)',
          chartType: 'bar',
          chartConfig: {
            labels: ['Alert Fired', 'Incident Confirmed'],
            datasets: [
              {
                label: 'count',
                data: [16, 1],
                backgroundColor: ['#ef4444', '#10b981']
              }
            ]
          }
        },
        {
          title: 'Error Rate + Request Volume',
          chartType: 'line',
          chartConfig: {
            labels: ['08:00', '08:20', '08:40', '09:00', '09:20', '09:40', '10:00'],
            datasets: [
              {
                label: 'error_rate (%)',
                data: [0.4, 3.8, 0.6, 4.1, 0.5, 3.5, 0.7],
                borderColor: '#ef4444',
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                tension: 0.3,
                fill: true
              },
              {
                label: 'request_count',
                data: [1200, 45, 1400, 52, 1300, 60, 1500],
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
        { timestamp: '09:02:11', level: 'WARN', service: 'datadog-monitor', message: '[checkout-error-rate] alert fired: error_rate=4.1%, requests=52' },
        { timestamp: '09:03:45', level: 'INFO', service: 'incident-bot', message: 'No user-impact ticket created (traffic below normal baseline)' },
        { timestamp: '09:20:05', level: 'WARN', service: 'datadog-monitor', message: '[checkout-error-rate] alert fired: error_rate=3.5%, requests=60' },
        { timestamp: '09:22:13', level: 'INFO', service: 'oncall', message: 'Acked as noise (no checkout failure spike)' }
      ],
      choices: [
        {
          text: '알림-실제장애 Precision/Recall부터 계산한다',
          isOptimal: true,
          feedback: '정확합니다. 먼저 신호 품질을 숫자로 확인해야 올바른 튜닝 방향을 잡을 수 있습니다.',
          nextStep: 'step-2a'
        },
        {
          text: '임계치를 즉시 2배 올려 알림 수를 줄인다',
          isOptimal: false,
          feedback: '근거 없는 임계치 상향은 실제 장애를 놓칠 위험이 큽니다. 먼저 품질 지표를 확인해야 합니다.',
          nextStep: 'step-2b-deadend'
        },
        {
          text: '온콜 채널을 일단 mute한다',
          isOptimal: false,
          feedback: '임시 mute는 피로를 줄일 수 있지만 탐지 공백을 만듭니다. 원인 분석이 우선입니다.',
          nextStep: 'step-2c'
        }
      ],
      hint: '트래픽이 매우 낮은 시점에 에러율만 보면 오탐이 늘어납니다. 품질 지표를 먼저 확인하세요.'
    },

    'step-2a': {
      title: '신호 품질 분석',
      description: '지난 7일 데이터로 precision/recall을 계산했습니다. precision이 크게 낮고, 야간 저트래픽 구간에서 오탐이 집중됩니다. 분모 조건이 없는 비율 모니터가 원인입니다.',
      metrics: [
        {
          title: 'Signal Quality (7d)',
          chartType: 'bar',
          chartConfig: {
            labels: ['Precision', 'Recall', 'MTTA(min)'],
            datasets: [
              {
                label: 'before tuning',
                data: [0.31, 0.89, 14],
                backgroundColor: ['#f59e0b', '#10b981', '#8b5cf6']
              }
            ]
          }
        },
        {
          title: 'False Positive by Hour',
          chartType: 'line',
          chartConfig: {
            labels: ['00', '03', '06', '09', '12', '15', '18', '21'],
            datasets: [
              {
                label: 'false positives',
                data: [8, 7, 5, 2, 1, 1, 2, 3],
                borderColor: '#ef4444',
                backgroundColor: 'rgba(239, 68, 68, 0.15)',
                tension: 0.3,
                fill: true
              }
            ]
          }
        }
      ],
      logs: [
        { timestamp: '10:10:01', level: 'INFO', service: 'monitor-audit', message: 'precision=0.31, recall=0.89, mtta=14m' },
        { timestamp: '10:10:09', level: 'WARN', service: 'monitor-audit', message: 'false positives concentrated in low traffic windows (<80 req/5m)' },
        { timestamp: '10:10:15', level: 'INFO', service: 'sre-lead', message: 'Recommend request floor + composite logic' }
      ],
      choices: [
        {
          text: 'error_rate + request_floor 복합 모니터로 재설계한다',
          isOptimal: true,
          feedback: '정답입니다. 분모 조건을 포함한 복합 모니터가 오탐을 크게 줄입니다.',
          nextStep: 'step-3a'
        },
        {
          text: 'anomaly monitor 민감도만 낮춰본다',
          isOptimal: false,
          feedback: '일부 노이즈는 줄지만 근본 원인(분모 조건 부재)은 남습니다.',
          nextStep: 'step-3b'
        }
      ],
      hint: '정확도는 높이고 재현율을 유지하는 방향이 목표입니다. 분모 조건을 잊지 마세요.'
    },

    'step-2b-deadend': {
      title: '임계치 상향만 적용 — Dead End',
      description: '임계치를 3%에서 6%로 올리자 노이즈는 줄었지만 실제 결제 실패 구간(4.8%)을 놓쳤습니다. 고객 영향이 있었는데 경보가 울리지 않아 탐지 실패(FN)가 증가했습니다.',
      isDeadEnd: true,
      metrics: [
        {
          title: 'Missed Incident After Threshold Increase',
          chartType: 'line',
          chartConfig: {
            labels: ['10:30', '10:35', '10:40', '10:45', '10:50'],
            datasets: [
              {
                label: 'error_rate (%)',
                data: [1.2, 2.1, 4.8, 3.9, 1.8],
                borderColor: '#ef4444',
                backgroundColor: 'rgba(239, 68, 68, 0.15)',
                tension: 0.3,
                fill: true
              },
              {
                label: 'threshold(6%)',
                data: [6, 6, 6, 6, 6],
                borderColor: '#6b7280',
                borderDash: [6, 4],
                tension: 0,
                fill: false
              }
            ]
          }
        }
      ],
      logs: [
        { timestamp: '10:41:30', level: 'ERROR', service: 'checkout-api', message: 'payment timeout surge observed, but monitor stayed OK' },
        { timestamp: '10:42:02', level: 'ERROR', service: 'support', message: 'Customer complaints increased by 37 within 5 min' }
      ],
      learningMoment: {
        title: '노이즈 감소와 탐지력 유지는 동시에 달성해야 한다',
        explanation: '임계치 상향만으로 노이즈를 줄이면 탐지 공백이 생길 수 있습니다. 분모 조건, 복합 조건, 라우팅 정책을 함께 설계해야 합니다.',
        moduleReference: 'Module 19: Datadog Monitor Engineering'
      },
      redirectTo: 'step-1',
      redirectMessage: '초기 분석으로 돌아가 근거 기반 튜닝을 진행하세요.'
    },

    'step-2c': {
      title: '채널 Mute의 부작용 확인',
      description: '온콜 채널 mute 후 알림 피로는 잠시 줄었지만, 실제 장애 탐지 시간이 늦어졌습니다. 임시 조치는 근본 해결이 아니므로 품질 분석으로 복귀해야 합니다.',
      metrics: [
        {
          title: 'Detection Delay After Mute',
          chartType: 'bar',
          chartConfig: {
            labels: ['Before mute', 'After mute'],
            datasets: [
              {
                label: 'mean detection delay (min)',
                data: [4, 17],
                backgroundColor: ['#10b981', '#ef4444']
              }
            ]
          }
        }
      ],
      logs: [
        { timestamp: '10:05:03', level: 'WARN', service: 'incident-bot', message: 'Critical alert muted channel detected' },
        { timestamp: '10:14:09', level: 'ERROR', service: 'oncall', message: 'Incident noticed via support ticket after 11 minutes' }
      ],
      choices: [
        {
          text: 'mute를 해제하고 신호 품질부터 재평가한다',
          isOptimal: true,
          feedback: '좋은 결정입니다. 알림 품질 문제는 분석과 설계로 해결해야 합니다.',
          nextStep: 'step-2a'
        }
      ],
      hint: 'Mute는 마지막 수단입니다. 먼저 precision/recall 문제를 해결하세요.'
    },

    'step-3a': {
      title: '복합 모니터 + 카나리 검증',
      description: 'error_rate 조건에 request floor를 추가한 composite monitor를 카나리로 48시간 운영했습니다. 노이즈는 감소하면서 실제 장애 감지는 유지되었습니다.',
      metrics: [
        {
          title: 'Before/After Monitor Quality',
          chartType: 'bar',
          chartConfig: {
            labels: ['Precision', 'Recall', 'Alert/day'],
            datasets: [
              {
                label: 'before',
                data: [0.31, 0.89, 22],
                backgroundColor: '#6b7280'
              },
              {
                label: 'after (canary)',
                data: [0.78, 0.86, 7],
                backgroundColor: '#10b981'
              }
            ]
          }
        }
      ],
      logs: [
        { timestamp: '11:20:00', level: 'INFO', service: 'monitor-engineering', message: 'Composite monitor canary started: error_rate>3% AND req_count>200/5m' },
        { timestamp: '36h later', level: 'INFO', service: 'monitor-engineering', message: 'false positives dropped by 68%, no missed p1/p2 events' }
      ],
      choices: [
        {
          text: '심각도별 라우팅과 renotify 정책까지 정리한다',
          isOptimal: true,
          feedback: '정확합니다. 조건 개선 후에는 라우팅/재알림 정책까지 맞춰야 운영 품질이 완성됩니다.',
          nextStep: 'step-4a'
        },
        {
          text: '검증 없이 모든 서비스에 동일 설정을 즉시 반영한다',
          isOptimal: false,
          feedback: '서비스 특성이 달라 동일 임계치를 일괄 적용하면 새로운 오탐/미탐이 발생할 수 있습니다.',
          nextStep: 'step-3c-deadend'
        }
      ],
      hint: '모니터 조건이 안정화되면 알림 라우팅까지 설계해야 MTTA가 개선됩니다.'
    },

    'step-3b': {
      title: 'Anomaly 민감도 단독 조정',
      description: '민감도를 낮추자 알림 수는 줄었지만 고정 임계 초과 상황을 놓치는 케이스가 남았습니다. anomaly 단독으로는 비즈니스 SLO 기준을 충분히 보장하기 어렵습니다.',
      metrics: [
        {
          title: 'Anomaly-only Monitor Gaps',
          chartType: 'line',
          chartConfig: {
            labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
            datasets: [
              {
                label: 'alerts',
                data: [18, 11, 12, 9, 10],
                borderColor: '#f59e0b',
                backgroundColor: 'rgba(245, 158, 11, 0.15)',
                tension: 0.3,
                fill: true
              },
              {
                label: 'missed incidents',
                data: [0, 1, 1, 1, 0],
                borderColor: '#ef4444',
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                tension: 0.3,
                fill: false
              }
            ]
          }
        }
      ],
      choices: [
        {
          text: 'threshold + request floor 복합 조건으로 보완한다',
          isOptimal: true,
          feedback: '좋습니다. anomaly는 보조 수단으로 두고 핵심 경보는 명시적 조건으로 보강해야 합니다.',
          nextStep: 'step-3a'
        }
      ],
      hint: '이상치 탐지는 강력하지만, 비즈니스 임계값 기반 모니터를 대체하지는 못합니다.'
    },

    'step-3c-deadend': {
      title: '일괄 반영으로 역효과 발생 — Dead End',
      description: 'checkout 기준을 low-traffic admin 서비스에 그대로 적용하자 해당 서비스가 하루 40회 이상 경보를 발생시켰습니다. 서비스별 트래픽/오류 패턴 차이를 반영해야 합니다.',
      isDeadEnd: true,
      metrics: [
        {
          title: 'Alert Explosion After Global Rollout',
          chartType: 'bar',
          chartConfig: {
            labels: ['checkout-api', 'admin-api', 'batch-worker'],
            datasets: [
              {
                label: 'alerts/day',
                data: [6, 43, 1],
                backgroundColor: ['#10b981', '#ef4444', '#3b82f6']
              }
            ]
          }
        }
      ],
      learningMoment: {
        title: '모니터는 서비스 맥락별로 튜닝해야 한다',
        explanation: '서비스 트래픽 규모, 실패 패턴, 비즈니스 중요도가 다르므로 동일 템플릿을 일괄 적용하면 실패합니다. 카나리 + 서비스별 파라미터가 필요합니다.',
        moduleReference: 'Module 20: Datadog SLO Operations'
      },
      redirectTo: 'step-3a',
      redirectMessage: '카나리 기준을 유지한 채 라우팅/운영 정책 단계로 진행하세요.'
    },

    'step-4a': {
      title: '라우팅/재알림/운영 정책 정렬',
      description: 'critical은 PagerDuty, warning은 Slack으로 라우팅하고 renotify를 30분으로 조정했습니다. 알림 메시지에 runbook 링크와 owner를 포함해 MTTA를 줄였습니다.',
      metrics: [
        {
          title: 'MTTA Before/After Routing Update',
          chartType: 'bar',
          chartConfig: {
            labels: ['Before', 'After'],
            datasets: [
              {
                label: 'MTTA (min)',
                data: [14, 6],
                backgroundColor: ['#6b7280', '#10b981']
              }
            ]
          }
        },
        {
          title: 'Alert Outcome Quality',
          chartType: 'line',
          chartConfig: {
            labels: ['week1', 'week2', 'week3', 'week4'],
            datasets: [
              {
                label: 'actionable alerts (%)',
                data: [29, 46, 63, 79],
                borderColor: '#10b981',
                backgroundColor: 'rgba(16, 185, 129, 0.15)',
                tension: 0.3,
                fill: true
              }
            ]
          }
        }
      ],
      logs: [
        { timestamp: '12:05:33', level: 'INFO', service: 'monitor-config', message: 'critical -> pagerduty, warning -> #alerts-payments' },
        { timestamp: '12:05:40', level: 'INFO', service: 'monitor-config', message: 'renotify interval updated: 10m -> 30m' },
        { timestamp: '12:06:00', level: 'INFO', service: 'runbook-bot', message: 'runbook and owner link inserted in notification template' }
      ],
      choices: [
        {
          text: '주간 리뷰와 오너십 규칙을 문서화하고 종료한다',
          isOptimal: true,
          feedback: '완벽합니다. 기술 튜닝이 운영 프로세스와 연결되면 지속 가능한 품질 개선이 됩니다.',
          nextStep: 'step-final'
        },
        {
          text: '변경 기록 없이 바로 종료한다',
          isOptimal: false,
          feedback: '기록이 없으면 다음 온콜이 같은 실수를 반복할 수 있습니다.',
          nextStep: 'step-4b-deadend'
        }
      ],
      hint: '모니터 튜닝의 마지막 단계는 운영 문서화와 리뷰 cadence 정착입니다.'
    },

    'step-4b-deadend': {
      title: '운영 문서화 누락 — Dead End',
      description: '2주 뒤 새 온콜이 변경 의도를 몰라 임계치를 되돌렸고, 노이즈가 재발했습니다. 튜닝 효과를 유지하려면 변경 근거와 리뷰 주기를 남겨야 합니다.',
      isDeadEnd: true,
      learningMoment: {
        title: '모니터 품질은 운영 습관으로 유지된다',
        explanation: '알림 조건만 바꾸고 기록을 남기지 않으면 조직 메모리가 사라집니다. owner, 변경 이유, 리뷰 주기를 반드시 남기세요.',
        moduleReference: 'Module 21: Datadog Cost Governance'
      },
      redirectTo: 'step-4a',
      redirectMessage: '운영 문서화 단계를 완료하고 최종 정리를 진행하세요.'
    },

    'step-final': {
      title: '튜닝 완료 및 표준화',
      description: '모니터 튜닝이 완료되었습니다. 핵심 원인은 "분모 조건 없는 에러율 단독 모니터 + 서비스 맥락 무시한 운영"이었습니다. 복합 조건, 라우팅 재설계, 리뷰 운영화로 신호 품질이 안정화되었습니다.',
      isTerminal: true,
      rootCause: {
        title: 'Low-traffic false positives from ratio-only monitor',
        summary: '저트래픽 구간에서 에러율 비율만으로 경보를 생성해 오탐이 폭증했고, 라우팅과 문서화 부재가 MTTA/재발률을 악화시켰습니다.',
        timeline: [
          { time: 'D-7', event: 'error-rate monitor 단독 운영 시작' },
          { time: 'D-2', event: '저트래픽 시간대 알림 flapping 급증' },
          { time: 'D-0 09:12', event: '2시간 16회 경보, 실장애 1회 확인' },
          { time: 'D-0 11:20', event: 'composite monitor canary 배포' },
          { time: 'D+2', event: 'precision 0.31 -> 0.78, MTTA 14m -> 6m 개선' }
        ],
        resolution: [
          'error_rate + request_floor 복합 조건 적용',
          'critical/warning 라우팅 분리 및 renotify 조정',
          '알림 메시지에 runbook/owner 링크 표준화',
          '주간 monitor quality review(precision/recall/MTTA) 정례화',
          '서비스별 트래픽 특성 반영한 임계치 관리'
        ]
      },
      postMortem: {
        template: {
          fields: [
            {
              id: 'monitoring-noise-patterns',
              label: '이번 튜닝에서 제거한 주요 오탐 패턴은?',
              type: 'textarea',
              placeholder: '저트래픽 구간 비율 왜곡으로 발생한 false positive',
              hint: '증상 + 발생 조건을 함께 적으세요.'
            },
            {
              id: 'monitoring-review-metrics',
              label: '다음 분기 monitor review에서 반드시 추적할 지표 2개는?',
              type: 'textarea',
              placeholder: 'precision, mtta',
              hint: '지표 이름과 목표 범위를 적어보세요.'
            }
          ]
        },
        rubric: {
          criteria: [
            {
              id: 'criteria-noise-patterns',
              label: '오탐 원인 진단이 제시되었는가',
              points: 55,
              fieldIds: ['monitoring-noise-patterns'],
              keywords: ['오탐', '저트래픽', '비율', '분모'],
              match: 'any',
              minMatch: 2
            },
            {
              id: 'criteria-review-metrics',
              label: '정량 모니터링 지표가 2개 이상 제시되었는가',
              points: 45,
              fieldIds: ['monitoring-review-metrics'],
              keywords: ['precision', 'recall', 'mtta', '탐지', 'MTTA', '정량'],
              match: 'any',
              minMatch: 2
            }
          ]
        }
      }
    }
  }
};