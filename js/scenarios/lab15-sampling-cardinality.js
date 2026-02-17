var SCENARIO_LAB15 = {
  id: 'lab15-sampling-cardinality',
  title: 'Sampling & Cardinality',
  difficulty: 'advanced',

  alert: {
    severity: 'warning',
    source: 'Datadog Usage Monitor',
    timestamp: '2026-02-13 10:31:22 KST',
    title: '[Cost] custom metrics/cardinality spike + log indexing surge',
    message: '지난 24시간 동안 Datadog 예상 월 비용이 63% 상승했습니다. custom metrics 시계열 수와 indexed logs가 동시에 급증했습니다.',
    metric: { name: 'estimated_monthly_cost_delta', value: '+63', unit: '%', threshold: '+15' },
    tags: ['env:prod', 'team:platform-observability', 'domain:cost-governance']
  },

  briefing: {
    description: '신규 개인화 기능 배포 후 observability 비용이 급등했습니다. CFO와 SRE 모두 비용 절감 압박이 있지만, 탐지 품질 저하 없이 해결해야 합니다. 고카디널리티 원인과 샘플링 정책을 함께 조정하세요.',
    environment: {
      services: ['api-gateway', 'recommendation-service', 'event-ingestor'],
      infra: 'Datadog Logs/APM/Custom Metrics',
      monitoring: 'Usage dashboards, log pipelines, metric summary'
    }
  },

  optimalPath: ['step-1', 'step-2a', 'step-3a', 'step-4a', 'step-final'],

  scoring: {
    gradeThresholds: {
      S: { maxExtraSteps: 0, maxHints: 0, label: 'Cost Governance Lead' },
      A: { maxExtraSteps: 2, maxHints: 1, label: 'Observability Engineer' },
      B: { maxExtraSteps: 4, maxHints: 2, label: 'Platform Practitioner' },
      C: { maxExtraSteps: Infinity, maxHints: Infinity, label: 'Budget Risk' }
    }
  },

  steps: {
    'step-1': {
      title: '비용 급등 구간 파악',
      description: '비용 대시보드를 확인한 결과, custom metrics 시계열 수가 4.2배, indexed logs가 2.7배 증가했습니다. 무엇이 급등을 만들었는지 드라이버를 분리해야 합니다.',
      metrics: [
        {
          title: 'Usage Delta (24h)',
          chartType: 'bar',
          chartConfig: {
            labels: ['Custom Metrics', 'Indexed Logs', 'APM Ingest'],
            datasets: [
              {
                label: 'increase (%)',
                data: [320, 170, 58],
                backgroundColor: ['#ef4444', '#f59e0b', '#3b82f6']
              }
            ]
          }
        },
        {
          title: 'Estimated Monthly Cost Trend',
          chartType: 'line',
          chartConfig: {
            labels: ['D-6', 'D-5', 'D-4', 'D-3', 'D-2', 'D-1', 'Today'],
            datasets: [
              {
                label: 'USD (k)',
                data: [48, 49, 49, 50, 51, 68, 80],
                borderColor: '#ef4444',
                backgroundColor: 'rgba(239, 68, 68, 0.12)',
                tension: 0.3,
                fill: true
              }
            ]
          }
        }
      ],
      logs: [
        { timestamp: '10:21:13', level: 'WARN', service: 'usage-monitor', message: 'custom_metric_ts_count exceeded monthly baseline by +320%' },
        { timestamp: '10:22:08', level: 'WARN', service: 'usage-monitor', message: 'indexed log volume increased +170% from recommendation-service' },
        { timestamp: '10:24:33', level: 'INFO', service: 'release-bot', message: 'personalization-v2 deployed to 100%' }
      ],
      choices: [
        {
          text: '카디널리티 상위 태그와 로그 파이프라인 드라이버를 먼저 찾는다',
          isOptimal: true,
          feedback: '정확합니다. 비용 최적화는 드라이버 식별부터 시작해야 안전합니다.',
          nextStep: 'step-2a'
        },
        {
          text: '전체 샘플링을 즉시 1%로 낮춘다',
          isOptimal: false,
          feedback: '비용은 줄 수 있지만 탐지력 붕괴 위험이 큽니다. 원인 식별 없이 일괄 축소는 위험합니다.',
          nextStep: 'step-2b-deadend'
        },
        {
          text: 'APM 수집을 전면 비활성화한다',
          isOptimal: false,
          feedback: '일시적 절감은 가능하지만 장애 분석 능력을 잃습니다. 먼저 정밀 원인 분석이 필요합니다.',
          nextStep: 'step-2c'
        }
      ],
      hint: '어떤 데이터가 비용을 끌어올리는지 구체적으로 분리하면 안전하게 줄일 수 있습니다.'
    },

    'step-2a': {
      title: '고카디널리티 원인 식별',
      description: 'metric summary에서 `user_id` 태그가 recommendation score 메트릭에 붙어 시계열이 폭증한 것을 확인했습니다. 로그 쪽은 debug payload가 인덱스에 직접 유입되고 있었습니다.',
      metrics: [
        {
          title: 'Top Cardinality Tags',
          chartType: 'bar',
          chartConfig: {
            labels: ['user_id', 'session_id', 'region', 'env'],
            datasets: [
              {
                label: 'distinct values',
                data: [1800000, 730000, 6, 3],
                backgroundColor: ['#ef4444', '#f59e0b', '#3b82f6', '#10b981']
              }
            ]
          }
        },
        {
          title: 'Indexed Log Source Share',
          chartType: 'pie',
          chartConfig: {
            labels: ['debug_payload', 'error_logs', 'audit_logs', 'healthcheck'],
            datasets: [
              {
                data: [48, 21, 19, 12],
                backgroundColor: ['#ef4444', '#10b981', '#3b82f6', '#6b7280']
              }
            ]
          }
        }
      ],
      logs: [
        { timestamp: '10:48:01', level: 'INFO', service: 'metric-summary', message: 'metric: recommendation.score tagged with user_id/session_id' },
        { timestamp: '10:48:12', level: 'WARN', service: 'log-pipeline', message: 'debug_payload logs indexed due to missing exclusion rule' },
        { timestamp: '10:48:26', level: 'INFO', service: 'platform', message: 'error logs currently 100% indexed and healthy' }
      ],
      choices: [
        {
          text: '고유 ID 태그 제거 + 로그 파이프라인 샘플링 정책을 분리 적용한다',
          isOptimal: true,
          feedback: '정답입니다. 메트릭 카디널리티와 로그 인덱싱 정책을 동시에 조정해야 큰 절감이 가능합니다.',
          nextStep: 'step-3a'
        },
        {
          text: '보존 기간만 단축해서 대응한다',
          isOptimal: false,
          feedback: '일부 완화는 되지만 생성량 폭증 문제는 그대로 남습니다.',
          nextStep: 'step-3b'
        }
      ],
      hint: '고유 ID는 메트릭에서 제거하고, 로그는 중요도별로 인덱싱/샘플링을 분리하세요.'
    },

    'step-2b-deadend': {
      title: '일괄 1% 샘플링 — Dead End',
      description: '비용은 빠르게 줄었지만 5xx 로그와 고지연 trace도 대부분 누락되어 장애 탐지/분석이 불가능해졌습니다. 비용 절감이 운영 리스크로 전환되었습니다.',
      isDeadEnd: true,
      metrics: [
        {
          title: 'Detection Quality Collapse',
          chartType: 'bar',
          chartConfig: {
            labels: ['Error log retention', 'High-latency trace retention'],
            datasets: [
              {
                label: 'retained (%)',
                data: [4, 2],
                backgroundColor: ['#ef4444', '#ef4444']
              }
            ]
          }
        }
      ],
      learningMoment: {
        title: '샘플링은 중요도 기반으로 적용해야 한다',
        explanation: '오류/고지연 신호를 보존하지 않으면 incident 대응 능력이 무너집니다. Always Keep 규칙이 필요합니다.',
        moduleReference: 'Module 21: Datadog Cost Governance'
      },
      redirectTo: 'step-1',
      redirectMessage: '드라이버 분석으로 돌아가 안전한 절감 전략을 설계하세요.'
    },

    'step-2c': {
      title: 'APM 전면 중단의 한계',
      description: 'APM 비활성화로 비용은 줄었지만, p99 지연 원인을 추적할 데이터가 사라졌습니다. 비용 최적화가 아니라 관측 포기 상태입니다.',
      metrics: [
        {
          title: 'Trace Visibility',
          chartType: 'bar',
          chartConfig: {
            labels: ['Before', 'After disable'],
            datasets: [
              {
                label: 'traces searchable (%)',
                data: [100, 0],
                backgroundColor: ['#10b981', '#ef4444']
              }
            ]
          }
        }
      ],
      choices: [
        {
          text: '원인 드라이버를 찾아 정밀 샘플링으로 전환한다',
          isOptimal: true,
          feedback: '맞습니다. 관측 신호를 유지하는 범위에서 비용을 줄여야 합니다.',
          nextStep: 'step-2a'
        }
      ],
      hint: '전체 비활성화보다 중요도 기반 샘플링이 훨씬 안전합니다.'
    },

    'step-3a': {
      title: '정밀 최적화 적용',
      description: 'recommendation score 메트릭에서 `user_id/session_id`를 제거하고 `segment_tier`로 집계했습니다. 로그 파이프라인은 오류 로그 100% 유지, debug payload는 5% 샘플로 조정했습니다.',
      metrics: [
        {
          title: 'Cardinality Reduction',
          chartType: 'bar',
          chartConfig: {
            labels: ['Before', 'After'],
            datasets: [
              {
                label: 'custom metric timeseries (M)',
                data: [2.4, 0.42],
                backgroundColor: ['#ef4444', '#10b981']
              }
            ]
          }
        },
        {
          title: 'Log Indexing Policy Impact',
          chartType: 'bar',
          chartConfig: {
            labels: ['error_logs', 'debug_payload', 'audit_logs'],
            datasets: [
              {
                label: 'indexed ratio (%)',
                data: [100, 5, 100],
                backgroundColor: ['#10b981', '#f59e0b', '#3b82f6']
              }
            ]
          }
        }
      ],
      logs: [
        { timestamp: '11:15:05', level: 'INFO', service: 'metrics-pipeline', message: 'tag policy applied: user_id/session_id dropped from recommendation.score' },
        { timestamp: '11:15:19', level: 'INFO', service: 'logs-pipeline', message: 'debug_payload sample_rate=5%, error logs keep=100%' },
        { timestamp: '11:15:28', level: 'INFO', service: 'governance-bot', message: 'policy-as-code check enabled for high-cardinality tags' }
      ],
      choices: [
        {
          text: '비용 절감과 탐지 품질을 함께 검증한다',
          isOptimal: true,
          feedback: '좋습니다. 최적화 이후에는 비용과 관측 품질을 동시에 확인해야 합니다.',
          nextStep: 'step-4a'
        },
        {
          text: '오류 로그도 일부 샘플링해 추가 절감한다',
          isOptimal: false,
          feedback: '오류 로그 축소는 incident 탐지 신호를 손상시킬 수 있습니다.',
          nextStep: 'step-3c-deadend'
        }
      ],
      hint: 'Always Keep(오류/치명 trace) 원칙을 지키면서 절감해야 합니다.'
    },

    'step-3b': {
      title: '보존 기간 단축만 적용',
      description: '보존 기간 단축으로 단기 비용은 줄었지만, 데이터 생성량 폭증은 그대로입니다. 다음 달에도 동일한 비용 압박이 반복될 가능성이 큽니다.',
      metrics: [
        {
          title: 'Short-term vs Structural Saving',
          chartType: 'bar',
          chartConfig: {
            labels: ['retention-only', 'cardinality + sampling'],
            datasets: [
              {
                label: 'sustainable saving score',
                data: [32, 84],
                backgroundColor: ['#f59e0b', '#10b981']
              }
            ]
          }
        }
      ],
      choices: [
        {
          text: '생성량 원인(카디널리티/인덱싱)을 직접 해결한다',
          isOptimal: true,
          feedback: '정확합니다. 구조적 원인을 해결해야 재발을 막을 수 있습니다.',
          nextStep: 'step-3a'
        }
      ],
      hint: 'retention은 후행 수단입니다. 먼저 생성량과 인덱싱 정책을 조정하세요.'
    },

    'step-3c-deadend': {
      title: '오류 로그 샘플링 과도 적용 — Dead End',
      description: '오류 로그를 20%만 남기자 P2 incident RCA에서 핵심 이벤트가 누락되었습니다. 비용은 줄었지만 장애 대응 품질이 크게 악화되었습니다.',
      isDeadEnd: true,
      learningMoment: {
        title: '절감 우선순위는 정상 대량 데이터부터',
        explanation: '오류/치명 신호는 가급적 보존하고, 정상 대량 데이터에서 절감해야 운영 리스크를 줄일 수 있습니다.',
        moduleReference: 'Lab 16: Incident Workflow'
      },
      redirectTo: 'step-3a',
      redirectMessage: '오류 신호 보존 원칙을 지키는 정책으로 다시 진행하세요.'
    },

    'step-4a': {
      title: '절감 효과 + 탐지력 검증',
      description: '최적화 7일 후, 예상 월 비용은 기존 대비 38% 감소했고 5xx/latency incident 탐지율은 유지되었습니다. 정책 준수 자동 검사까지 연결해 재발 방지를 준비합니다.',
      metrics: [
        {
          title: 'Outcome Summary',
          chartType: 'bar',
          chartConfig: {
            labels: ['Cost (USD k/mo)', 'Incident detection rate (%)'],
            datasets: [
              {
                label: 'before',
                data: [80, 97],
                backgroundColor: '#6b7280'
              },
              {
                label: 'after',
                data: [49, 96],
                backgroundColor: '#10b981'
              }
            ]
          }
        }
      ],
      logs: [
        { timestamp: 'D+7 10:00', level: 'INFO', service: 'finance-bot', message: 'estimated monthly Datadog cost reduced by 38%' },
        { timestamp: 'D+7 10:05', level: 'INFO', service: 'quality-check', message: 'incident detection coverage remained within expected range' },
        { timestamp: 'D+7 10:07', level: 'INFO', service: 'ci-policy', message: 'high-cardinality tag guardrail enabled in CI' }
      ],
      choices: [
        {
          text: '정책을 팀 표준으로 문서화하고 종료한다',
          isOptimal: true,
          feedback: '완벽합니다. 비용 절감은 운영 표준으로 고정해야 지속됩니다.',
          nextStep: 'step-final'
        },
        {
          text: '정책 자동검사는 생략한다',
          isOptimal: false,
          feedback: '자동검사가 없으면 시간이 지나며 규칙 위반이 재발합니다.',
          nextStep: 'step-4b-deadend'
        }
      ],
      hint: '비용 절감 조치의 내구성은 자동 정책 검증에 달려 있습니다.'
    },

    'step-4b-deadend': {
      title: 'Guardrail 미적용 — Dead End',
      description: '신규 팀이 user_id 태그를 다시 메트릭에 추가하며 3주 만에 비용이 반등했습니다. 규칙 자동화가 없으면 개선 효과가 유지되지 않습니다.',
      isDeadEnd: true,
      learningMoment: {
        title: '거버넌스는 자동화가 핵심이다',
        explanation: '정책 문서만으로는 부족합니다. CI/CD 또는 파이프라인 레벨에서 위반을 차단해야 재발을 막을 수 있습니다.',
        moduleReference: 'Module 21: Datadog Cost Governance'
      },
      redirectTo: 'step-4a',
      redirectMessage: '자동 guardrail을 포함해 운영 모델을 완성하세요.'
    },

    'step-final': {
      title: 'Cost Governance 안정화 완료',
      description: '카디널리티 제어와 중요도 기반 샘플링을 통해 비용과 관측 품질을 동시에 관리하는 운영 모델을 구축했습니다. 이제 팀 단위로 지속 가능한 거버넌스가 가능합니다.',
      isTerminal: true,
      rootCause: {
        title: 'High-cardinality tags + unfiltered debug indexing',
        summary: '고유 ID 태그 유입과 debug 로그 인덱싱 누락이 동시에 발생해 비용이 급등했습니다. 구조적 원인 해결 없이 retention만 조정하면 재발합니다.',
        timeline: [
          { time: 'D-1', event: 'personalization-v2 전면 배포' },
          { time: 'D-1~D0', event: 'custom metric TS +320%, indexed logs +170%' },
          { time: 'D0 10:31', event: 'usage monitor 경보 발생' },
          { time: 'D0 11:15', event: 'tag/pipeline policy 적용' },
          { time: 'D+7', event: '비용 38% 절감 + 탐지율 유지 확인' }
        ],
        resolution: [
          '메트릭에서 user_id/session_id 제거, 집계 태그로 대체',
          '오류 로그 100% 보존, debug payload 샘플링 적용',
          '카디널리티 정책 위반 CI guardrail 도입',
          '월간 비용 드라이버 리뷰와 owner 추적',
          '절감 이후 탐지율 회귀 테스트 운영'
        ]
      },
      postMortem: {
        template: {
          fields: [
            {
              id: 'high-cardinality-tags',
              label: '현재 서비스에서 고카디널리티 위험 태그 2개를 적어보세요.',
              type: 'textarea',
              placeholder: 'user_id, request_id',
              hint: '고유값 기반 태그를 우선 식별하세요.'
            },
            {
              id: 'always-keep-data',
              label: 'Always Keep로 유지해야 할 데이터 범주를 정의하세요.',
              type: 'textarea',
              placeholder: '5xx 로그, timeout trace, security audit 로그',
              hint: 'incident 대응에 필수적인 신호를 중심으로 작성하세요.'
            }
          ]
        },
        rubric: {
          criteria: [
            {
              id: 'criteria-high-cardinality',
              label: '고카디널리티 위험 태그를 적절히 식별했는가',
              points: 55,
              fieldIds: ['high-cardinality-tags'],
              keywords: ['user_id', 'session_id', 'request_id', '카디널리티', '고유값', 'trace_id'],
              match: 'any',
              minMatch: 2
            },
            {
              id: 'criteria-always-keep',
              label: '항상 보존해야 하는 범주가 구체적으로 제시되었는가',
              points: 45,
              fieldIds: ['always-keep-data'],
              keywords: ['5xx', 'timeout', 'trace', 'incident', '보존', '에러', '보안'],
              match: 'any',
              minMatch: 2
            }
          ]
        }
      }
    }
  }
};