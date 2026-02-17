var SCENARIO_LAB14 = {
  id: 'lab14-burn-rate-routing',
  title: 'Burn-rate Routing',
  difficulty: 'advanced',

  alert: {
    severity: 'critical',
    source: 'Datadog SLO Monitor',
    timestamp: '2026-02-12 14:04:07 KST',
    title: '[P1] checkout-slo burn rate mismatch: noisy page + delayed escalation',
    message: '동일한 burn-rate 모니터가 경미한 스파이크에도 PagerDuty를 호출하고, 반대로 장시간 악화 구간은 늦게 감지되는 문제가 확인되었습니다.',
    metric: { name: 'slo.burn_rate', value: '12.6', unit: 'x', threshold: '7.0' },
    tags: ['service:checkout', 'slo:availability', 'team:payments', 'routing:needs-tuning']
  },

  briefing: {
    description: '결제 서비스의 SLO 예산이 최근 3일간 41% 소진되었습니다. 현재는 단일 burn-rate 기준으로 모든 경보를 PagerDuty로 보내고 있어, 경미한 이슈까지 야간 호출이 발생합니다. 반대로 느리게 누적되는 장애는 감지가 늦어지는 문제가 있습니다. 멀티 윈도우 + 심각도별 라우팅으로 재설계하세요.',
    environment: {
      services: ['checkout-api', 'payment-adapter', 'risk-evaluator'],
      infra: 'Datadog SLO + Monitor + PagerDuty + Slack',
      monitoring: 'single-threshold burn-rate monitor (legacy)'
    }
  },

  optimalPath: ['step-1', 'step-2a', 'step-3a', 'step-4a', 'step-final'],

  scoring: {
    gradeThresholds: {
      S: { maxExtraSteps: 0, maxHints: 0, label: 'Incident Commander' },
      A: { maxExtraSteps: 2, maxHints: 1, label: 'On-call Lead' },
      B: { maxExtraSteps: 4, maxHints: 2, label: 'Response Engineer' },
      C: { maxExtraSteps: Infinity, maxHints: Infinity, label: 'Escalation Risk' }
    }
  },

  steps: {
    'step-1': {
      title: '현재 라우팅 문제 파악',
      description: '지난 72시간 알림 로그를 분석한 결과, 29건의 페이지 중 18건이 10분 이내 자체 복구되는 경미 이벤트였습니다. 반면 3시간 지속된 성능 저하는 첫 페이지까지 37분이 소요되었습니다.',
      metrics: [
        {
          title: 'Paged Alerts Quality (72h)',
          chartType: 'bar',
          chartConfig: {
            labels: ['Paged Total', 'Actionable', 'Noise'],
            datasets: [
              {
                label: 'count',
                data: [29, 11, 18],
                backgroundColor: ['#3b82f6', '#10b981', '#ef4444']
              }
            ]
          }
        },
        {
          title: 'Burn Rate Windows',
          chartType: 'line',
          chartConfig: {
            labels: ['12:00', '12:30', '13:00', '13:30', '14:00', '14:30'],
            datasets: [
              {
                label: '5m burn rate',
                data: [3.2, 15.4, 8.1, 2.0, 11.8, 4.0],
                borderColor: '#ef4444',
                backgroundColor: 'rgba(239, 68, 68, 0.12)',
                tension: 0.3,
                fill: true
              },
              {
                label: '1h burn rate',
                data: [1.8, 2.5, 4.2, 4.9, 6.8, 7.3],
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
        { timestamp: '13:02:15', level: 'WARN', service: 'slo-monitor', message: 'burn_rate=15.4 for 5m triggered pager (auto-recovered in 6m)' },
        { timestamp: '13:45:07', level: 'ERROR', service: 'customer-support', message: 'checkout latency complaints rising; no page fired yet' },
        { timestamp: '14:01:42', level: 'WARN', service: 'slo-monitor', message: 'burn_rate=11.8 page fired after sustained degradation' }
      ],
      choices: [
        {
          text: '5m/1h 멀티 윈도우 burn-rate 상관관계를 분석한다',
          isOptimal: true,
          feedback: '정확합니다. 빠른 스파이크와 지속 악화를 분리하려면 멀티 윈도우 분석이 필수입니다.',
          nextStep: 'step-2a'
        },
        {
          text: '야간 PagerDuty를 일괄 mute한다',
          isOptimal: false,
          feedback: '노이즈는 줄지만 실제 사고를 놓칠 수 있습니다. 라우팅 설계가 우선입니다.',
          nextStep: 'step-2b-deadend'
        },
        {
          text: '단일 1h burn-rate 임계치만 유지한다',
          isOptimal: false,
          feedback: '지속 장애는 잡을 수 있지만 급격한 악화를 늦게 탐지할 위험이 큽니다.',
          nextStep: 'step-2c'
        }
      ],
      hint: '짧은 창과 긴 창을 함께 봐야 경보 품질과 탐지 속도를 동시에 잡을 수 있습니다.'
    },

    'step-2a': {
      title: '멀티 윈도우 분해 분석',
      description: '데이터를 분해해보니 5m만 높은 구간은 대부분 자동 복구되는 스파이크였고, 5m+1h 모두 높은 구간은 실제 고객 영향이 동반되는 사례였습니다. 심각도 분리가 가능해졌습니다.',
      metrics: [
        {
          title: 'Window Combination vs Impact',
          chartType: 'bar',
          chartConfig: {
            labels: ['5m only high', '5m+1h high', '1h only high'],
            datasets: [
              {
                label: 'user-impact probability (%)',
                data: [9, 86, 42],
                backgroundColor: ['#f59e0b', '#ef4444', '#3b82f6']
              }
            ]
          }
        }
      ],
      logs: [
        { timestamp: '14:20:10', level: 'INFO', service: 'sre-analytics', message: '5m-only spikes mostly self-recovered (<10m)' },
        { timestamp: '14:20:18', level: 'INFO', service: 'sre-analytics', message: '5m+1h high strongly correlated with failed payments' }
      ],
      choices: [
        {
          text: 'critical/warning 이중 경보 + 채널 분리로 재설계한다',
          isOptimal: true,
          feedback: '좋습니다. 증상 강도에 맞춰 라우팅을 분리하면 피로를 줄이고 중요한 신호를 강화할 수 있습니다.',
          nextStep: 'step-3a'
        },
        {
          text: '모든 조건을 단일 severity로 유지한다',
          isOptimal: false,
          feedback: '신호 강도 차이를 반영하지 못해 노이즈와 지연 감지가 반복됩니다.',
          nextStep: 'step-3b'
        }
      ],
      hint: '핵심은 "빠른 탐지"와 "지속성 확인"을 분리해 severity에 반영하는 것입니다.'
    },

    'step-2b-deadend': {
      title: '야간 Mute 적용 — Dead End',
      description: '야간 mute 후 40분 동안 지속된 결제 실패를 support 티켓으로 뒤늦게 인지했습니다. 경보 채널 제거는 탐지 공백을 초래합니다.',
      isDeadEnd: true,
      metrics: [
        {
          title: 'Detection Gap After Mute',
          chartType: 'bar',
          chartConfig: {
            labels: ['Before mute', 'After mute'],
            datasets: [
              {
                label: 'time to page (min)',
                data: [6, 41],
                backgroundColor: ['#10b981', '#ef4444']
              }
            ]
          }
        }
      ],
      learningMoment: {
        title: '문제는 채널이 아니라 라우팅 로직이다',
        explanation: '노이즈를 줄이려면 mute가 아니라 멀티 윈도우/심각도 분리로 신호를 정제해야 합니다.',
        moduleReference: 'Module 20: Datadog SLO Operations'
      },
      redirectTo: 'step-1',
      redirectMessage: '라우팅 로직 분석 단계로 돌아가세요.'
    },

    'step-2c': {
      title: '단일 장기 윈도우 한계 확인',
      description: '1h burn-rate 단독 기준은 안정적으로 보이지만 급격한 오류 폭증을 늦게 감지합니다. 고속 악화 구간에서 초기 대응 타이밍을 놓칩니다.',
      metrics: [
        {
          title: 'Fast Spike Detection Delay',
          chartType: 'line',
          chartConfig: {
            labels: ['t+0', 't+5', 't+10', 't+15', 't+20', 't+25'],
            datasets: [
              {
                label: 'actual error rate (%)',
                data: [0.4, 1.2, 4.8, 5.2, 3.1, 1.0],
                borderColor: '#ef4444',
                backgroundColor: 'rgba(239, 68, 68, 0.12)',
                tension: 0.3,
                fill: true
              },
              {
                label: '1h burn threshold crossed?',
                data: [0, 0, 0, 0, 1, 1],
                borderColor: '#3b82f6',
                tension: 0,
                fill: false
              }
            ]
          }
        }
      ],
      choices: [
        {
          text: '짧은/긴 창 조합으로 severity를 재정의한다',
          isOptimal: true,
          feedback: '맞습니다. 단일 윈도우 한계를 보완하려면 멀티 윈도우가 필요합니다.',
          nextStep: 'step-2a'
        }
      ],
      hint: '단일 긴 창은 노이즈는 줄이지만 빠른 탐지 능력을 희생합니다.'
    },

    'step-3a': {
      title: '경보 라우팅 재설계',
      description: '두 개의 경보 클래스를 설계했습니다. Critical은 5m>14 AND 1h>7 조건에서 PagerDuty+Incident 생성, Warning은 30m>6 AND 6h>3 조건에서 Slack+Jira 자동 생성으로 분리했습니다.',
      metrics: [
        {
          title: 'Routing Policy by Severity',
          chartType: 'bar',
          chartConfig: {
            labels: ['Critical', 'Warning'],
            datasets: [
              {
                label: 'target channel weight',
                data: [100, 100],
                backgroundColor: ['#ef4444', '#f59e0b']
              }
            ]
          }
        }
      ],
      logs: [
        { timestamp: '15:02:03', level: 'INFO', service: 'monitor-config', message: 'Critical monitor: short>14 AND long>7 -> pagerduty + incident' },
        { timestamp: '15:02:10', level: 'INFO', service: 'monitor-config', message: 'Warning monitor: short>6 AND long>3 -> slack + jira' },
        { timestamp: '15:02:18', level: 'INFO', service: 'monitor-config', message: 'Notification template includes SLO dashboard + runbook + owner' }
      ],
      choices: [
        {
          text: '히스토리 리플레이로 오탐/미탐을 검증한다',
          isOptimal: true,
          feedback: '좋습니다. 정책 변경 후에는 과거 데이터 리플레이 검증이 필요합니다.',
          nextStep: 'step-4a'
        },
        {
          text: '리플레이 없이 바로 프로덕션 전환한다',
          isOptimal: false,
          feedback: '검증 없는 전환은 예기치 않은 미탐/오탐을 유발할 수 있습니다.',
          nextStep: 'step-3c-deadend'
        }
      ],
      hint: '설계 다음 단계는 반드시 검증입니다. 특히 SLO 경보는 미탐 비용이 큽니다.'
    },

    'step-3b': {
      title: '단일 Severity 유지의 부작용',
      description: '모든 경보를 같은 우선순위로 유지하자, 여전히 경미 이슈와 긴급 이슈가 같은 채널에서 섞여 대응 우선순위가 흐려졌습니다.',
      metrics: [
        {
          title: 'Mixed Severity Confusion',
          chartType: 'bar',
          chartConfig: {
            labels: ['High impact', 'Low impact'],
            datasets: [
              {
                label: 'same channel alerts/day',
                data: [4, 13],
                backgroundColor: ['#ef4444', '#f59e0b']
              }
            ]
          }
        }
      ],
      choices: [
        {
          text: 'severity별 경보/채널을 분리한다',
          isOptimal: true,
          feedback: '올바른 방향입니다. 경보 강도에 따른 라우팅 분리가 필요합니다.',
          nextStep: 'step-3a'
        }
      ],
      hint: '심각도가 다른 경보를 한 채널에 섞으면 응답 품질이 떨어집니다.'
    },

    'step-3c-deadend': {
      title: '검증 생략으로 미탐 발생 — Dead End',
      description: '리플레이 검증 없이 전환한 뒤, region 태그 누락으로 특정 AZ 장애가 warning으로만 분류되었습니다. critical 페이지가 늦어져 복구가 지연되었습니다.',
      isDeadEnd: true,
      learningMoment: {
        title: 'Routing 정책은 반드시 리플레이 검증해야 한다',
        explanation: '조건식/태그 누락은 실제 사고에서 큰 차이를 만듭니다. 과거 incident 데이터 기반 검증 절차를 고정하세요.',
        moduleReference: 'Module 19: Datadog Monitor Engineering'
      },
      redirectTo: 'step-3a',
      redirectMessage: '리플레이 검증 단계로 돌아가 정책 정확도를 확인하세요.'
    },

    'step-4a': {
      title: '히스토리 리플레이 및 운영 룰 고정',
      description: '과거 30일 incident를 리플레이한 결과, 불필요 페이지는 58% 감소했고 실제 고영향 장애 감지 시간은 37분에서 8분으로 단축되었습니다. ack 규칙과 escalation 타이머를 문서화합니다.',
      metrics: [
        {
          title: 'Policy Impact',
          chartType: 'bar',
          chartConfig: {
            labels: ['Noise pages/day', 'Mean detection delay(min)'],
            datasets: [
              {
                label: 'before',
                data: [9.6, 37],
                backgroundColor: '#6b7280'
              },
              {
                label: 'after',
                data: [4.0, 8],
                backgroundColor: '#10b981'
              }
            ]
          }
        }
      ],
      logs: [
        { timestamp: '16:11:00', level: 'INFO', service: 'replay-engine', message: '30-day replay passed: no critical miss detected' },
        { timestamp: '16:11:13', level: 'INFO', service: 'ops-policy', message: 'Critical ack SLA: 5m, warning ack SLA: 30m' },
        { timestamp: '16:11:20', level: 'INFO', service: 'ops-policy', message: 'Escalation timer set: critical 10m unacked -> secondary oncall' }
      ],
      choices: [
        {
          text: '정책을 표준 운영 문서에 반영하고 마무리한다',
          isOptimal: true,
          feedback: '완벽합니다. 기술 설정과 운영 정책이 결합되어야 재발을 막을 수 있습니다.',
          nextStep: 'step-final'
        },
        {
          text: 'ack/escalation 규칙은 생략하고 종료한다',
          isOptimal: false,
          feedback: '규칙이 없으면 경보는 개선되어도 대응 일관성이 깨집니다.',
          nextStep: 'step-4b-deadend'
        }
      ],
      hint: 'Routing 품질은 monitor 조건 + ack/escalation 정책 두 축으로 결정됩니다.'
    },

    'step-4b-deadend': {
      title: '운영 규칙 누락 — Dead End',
      description: '2주 후 야간 incident에서 누가 ack해야 하는지 불명확해 12분 지연이 발생했습니다. 라우팅 개선만으로는 충분하지 않습니다.',
      isDeadEnd: true,
      learningMoment: {
        title: '경보 정책은 사람 운영 규칙까지 포함해야 완성된다',
        explanation: 'ack SLA, escalation 타이머, 역할 책임이 빠지면 동일한 혼선이 반복됩니다.',
        moduleReference: 'Lab 16: Incident Workflow'
      },
      redirectTo: 'step-4a',
      redirectMessage: '운영 규칙을 포함해 정책을 마무리하세요.'
    },

    'step-final': {
      title: 'Burn-rate Routing 최적화 완료',
      description: '멀티 윈도우 기반 severity 분리와 라우팅 재설계가 완료되었습니다. 결과적으로 노이즈 페이지는 줄고, 실제 고객 영향 장애는 더 빠르게 탐지됩니다.',
      isTerminal: true,
      rootCause: {
        title: 'Single-window, single-severity routing design flaw',
        summary: '단일 burn-rate 조건으로 모든 경보를 동일 채널에 보내면서 경미 이슈 노이즈와 중대 사고 지연이 동시에 발생했습니다.',
        timeline: [
          { time: 'D-3', event: 'SLO budget 41% 소진 경고' },
          { time: 'D-1', event: '야간 노이즈 페이지 다수 발생' },
          { time: 'D-0 14:04', event: 'Routing mismatch incident opened' },
          { time: 'D-0 15:02', event: 'Dual-window + dual-severity monitor 설계' },
          { time: 'D-0 16:11', event: '30일 리플레이 검증 완료' }
        ],
        resolution: [
          'Critical/Warning 멀티 윈도우 경보 분리',
          'PagerDuty vs Slack/Jira 채널 분리',
          '알림 메시지에 SLO 대시보드/런북/오너 포함',
          'ack SLA + escalation timer 문서화',
          '월간 routing 품질 리뷰(노이즈율/탐지지연) 고정'
        ]
      },
      postMortem: {
        template: {
          fields: [
            {
              id: 'routing-severity-policy',
              label: '현재 서비스에 적용할 critical/warning 분리 기준을 적어보세요.',
              type: 'textarea',
              placeholder: 'critical: 5m>14 && 1h>7, warning: 30m>6 && 6h>3',
              hint: '숫자와 윈도우를 함께 적으세요.'
            },
            {
              id: 'routing-quality-indicators',
              label: 'Routing 품질을 월별로 평가할 핵심 지표 2가지는?',
              type: 'textarea',
              placeholder: 'noise pages/day, mean detection delay',
              hint: '노이즈와 탐지 속도 지표를 각각 포함하세요.'
            }
          ]
        },
        rubric: {
          criteria: [
            {
              id: 'criteria-routing-policy',
              label: '임계치 기반 critical/warning 정책이 명시되었는가',
              points: 55,
              fieldIds: ['routing-severity-policy'],
              keywords: ['critical', 'warning', '5m', '1h', '30m', '6h', 'multi', '분리'],
              match: 'any',
              minMatch: 2
            },
            {
              id: 'criteria-routing-metrics',
              label: '모니터 품질 지표(노이즈/탐지 지연)가 제시되었는가',
              points: 45,
              fieldIds: ['routing-quality-indicators'],
              keywords: ['noise', '탐지', 'delay', 'pages', '노이즈율', '탐지지연'],
              match: 'any',
              minMatch: 2
            }
          ]
        }
      }
    }
  }
};