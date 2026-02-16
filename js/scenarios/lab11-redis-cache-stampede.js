var SCENARIO_LAB11 = {
  id: 'lab11-redis-cache-stampede',
  title: 'Redis Cache Stampede + N+1',
  difficulty: 'expert',

  alert: {
    severity: 'critical',
    source: 'Datadog Monitor',
    timestamp: '2024-05-12 14:05:23 KST',
    title: '[P1] GraphQL SLO 위반 — p99 4200ms (SLO: 500ms)',
    message: 'Flash sale 중 GraphQL API의 p99 응답 시간이 4200ms로 급등하여 SLO를 8배 초과했습니다. 인기 상품 카탈로그 조회 시 대량의 DB 쿼리가 발생하고 있습니다.',
    metric: { name: 'trace.graphql.p99_latency', value: '4200', unit: 'ms', threshold: '500' },
    tags: ['service:graphql-api', 'env:production', 'severity:p1']
  },

  briefing: {
    description: '일요일 오후 2시 flash sale 시작 직후, GraphQL API의 응답 시간이 급격히 증가하고 있습니다. 인기 상품 카탈로그 캐시 키(TTL 5분)가 만료된 시점에 2400건의 동시 요청이 몰리면서 cache miss가 발생했습니다. DataLoader의 maxBatchSize(25) 제한을 초과하여 N+1 개별 쿼리로 폴백되고 있으며, RDS read replica의 CPU가 95%로 포화 상태입니다.',
    environment: {
      services: ['graphql-api (Node.js)', 'Redis Cluster', 'RDS Aurora MySQL (read replica)'],
      infra: 'EKS, ElastiCache Redis 6.x, RDS Aurora db.r6g.xlarge',
      monitoring: 'Datadog APM + RDS Integration + Redis Integration'
    }
  },

  optimalPath: ['step-1', 'step-2a', 'step-3a', 'step-4a', 'step-final'],

  scoring: {
    gradeThresholds: {
      S: { maxExtraSteps: 0, maxHints: 0, label: 'Staff SRE' },
      A: { maxExtraSteps: 2, maxHints: 1, label: 'Senior SRE' },
      B: { maxExtraSteps: 4, maxHints: 2, label: 'Proficient' },
      C: { maxExtraSteps: Infinity, maxHints: Infinity, label: 'Learning' }
    }
  },

  steps: {
    'step-1': {
      title: 'GraphQL API 응답시간 급등',
      description: 'Datadog APM 대시보드에서 graphql-api 서비스의 p99 레이턴시가 14:05분을 기점으로 150ms에서 4200ms로 급등한 것을 확인했습니다. 동시에 요청 실패율도 급증하고 있습니다.',
      metrics: [
        {
          title: 'GraphQL API p99 Latency',
          chartType: 'line',
          chartConfig: {
            labels: ['14:00', '14:02', '14:04', '14:05', '14:06', '14:07', '14:08'],
            datasets: [{
              label: 'trace.graphql.p99_latency (ms)',
              data: [150, 160, 155, 4200, 5800, 6100, 5500],
              borderColor: '#ef4444',
              backgroundColor: 'rgba(239, 68, 68, 0.1)',
              tension: 0.3,
              fill: true
            }]
          }
        },
        {
          title: 'Request Hits & Errors',
          chartType: 'line',
          chartConfig: {
            labels: ['14:00', '14:02', '14:04', '14:05', '14:06', '14:07', '14:08'],
            datasets: [
              {
                label: 'trace.graphql.hits (/min)',
                data: [800, 1200, 1800, 2400, 2200, 2100, 2000],
                borderColor: '#3b82f6',
                backgroundColor: 'rgba(59, 130, 246, 0.1)',
                tension: 0.3,
                fill: true
              },
              {
                label: 'trace.graphql.errors (/min)',
                data: [2, 3, 5, 180, 420, 380, 350],
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
        { timestamp: '14:05:10', level: 'ERROR', service: 'graphql-api', message: '[CatalogResolver] Query timeout: getProductsByCategoryId — 4.2s exceeded' },
        { timestamp: '14:05:15', level: 'WARN', service: 'graphql-api', message: '[DataLoader] maxBatchSize(25) exceeded, falling back to individual queries' },
        { timestamp: '14:05:20', level: 'ERROR', service: 'graphql-api', message: '[Redis] cache miss for key: catalog:flash-sale:popular — 2400 concurrent requests' },
        { timestamp: '14:05:28', level: 'ERROR', service: 'rds-read-replica', message: '[Performance] CPU utilization: 95%, active connections: 185/200' }
      ],
      choices: [
        {
          text: 'Redis cache hit/miss 메트릭 확인',
          isOptimal: true,
          feedback: '정확한 판단입니다. 갑작스러운 응답 시간 급등은 cache miss와 관련이 있을 가능성이 높습니다. Redis 메트릭을 확인하여 cache stampede가 발생했는지 분석하세요.',
          nextStep: 'step-2a'
        },
        {
          text: 'RDS 메트릭 확인',
          isOptimal: false,
          feedback: 'RDS 메트릭도 중요하지만, 근본 원인은 캐시 계층에 있을 가능성이 높습니다. RDS 부하는 cache miss의 결과일 수 있습니다.',
          nextStep: 'step-2b'
        },
        {
          text: 'GraphQL 서비스 스케일아웃',
          isOptimal: false,
          feedback: 'Cache stampede 상황에서 서버를 늘리면 모든 서버가 동시에 cache miss를 겪어 DB 부하만 증폭됩니다.',
          nextStep: 'step-2c-deadend'
        }
      ],
      hint: '특정 시점에 갑자기 응답시간이 급등했다면 캐시 만료와 관련이 있을 수 있습니다.'
    },

    'step-2a': {
      title: 'Redis Cache Hit/Miss + DataLoader',
      description: 'Redis 메트릭을 분석한 결과, 14:05분에 keyspace_hits가 급감하고 keyspace_misses가 8500/min으로 폭증했습니다. 동시에 DataLoader의 batch_size가 maxBatchSize(25)에 도달하여 N+1 쿼리로 폴백되고 있음을 확인했습니다.',
      metrics: [
        {
          title: 'Redis Keyspace Hits vs Misses',
          chartType: 'line',
          chartConfig: {
            labels: ['14:00', '14:01', '14:02', '14:03', '14:04', '14:05', '14:06', '14:07'],
            datasets: [
              {
                label: 'redis.keyspace_hits (/min)',
                data: [4500, 5800, 7200, 120, 85, 150, 800, 2200],
                borderColor: '#10b981',
                backgroundColor: 'rgba(16, 185, 129, 0.1)',
                tension: 0.3,
                fill: true
              },
              {
                label: 'redis.keyspace_misses (/min)',
                data: [150, 180, 220, 8500, 9200, 8800, 6500, 4200],
                borderColor: '#ef4444',
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                tension: 0.3,
                fill: true
              }
            ]
          }
        },
        {
          title: 'DataLoader Batch Size & Cache Miss',
          chartType: 'line',
          chartConfig: {
            labels: ['14:00', '14:01', '14:02', '14:03', '14:04', '14:05', '14:06', '14:07'],
            datasets: [
              {
                label: 'dataloader.batch_size',
                data: [22, 24, 23, 25, 25, 25, 25, 25],
                borderColor: '#8b5cf6',
                backgroundColor: 'rgba(139, 92, 246, 0.1)',
                tension: 0.3,
                fill: true
              },
              {
                label: 'cache.miss (/min)',
                data: [45, 60, 80, 2400, 2800, 2600, 1800, 1200],
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
        { timestamp: '14:05:30', level: 'INFO', service: 'redis-cluster', message: '[Redis Stats] keyspace_hits: 120/min, keyspace_misses: 8500/min, hit_ratio: 1.4%' },
        { timestamp: '14:05:35', level: 'WARN', service: 'graphql-api', message: '[DataLoader] Batch size limit reached (25/25) — falling back to 96 individual SELECT queries' },
        { timestamp: '14:05:40', level: 'ERROR', service: 'graphql-api', message: '[Cache] catalog:flash-sale:popular expired (TTL: 5min), 2400 concurrent requests triggered cache stampede' },
        { timestamp: '14:05:45', level: 'INFO', service: 'datadog-apm', message: '[APM Trace] Single GraphQL request generated 96 SQL queries (expected: 1~3 with cache)' }
      ],
      choices: [
        {
          text: 'APM Trace로 N+1 패턴 분석',
          isOptimal: true,
          feedback: '탁월한 판단입니다. Cache stampede와 DataLoader의 한계로 N+1 쿼리가 발생하고 있습니다. APM Trace를 분석하여 정확한 쿼리 패턴을 파악하세요.',
          nextStep: 'step-3a'
        },
        {
          text: 'Redis TTL 증가로 만료 빈도 감소',
          isOptimal: false,
          feedback: 'TTL을 늘리면 stampede를 지연시킬 수는 있지만, 만료 순간에는 동일한 문제가 재발합니다. 근본적인 stampede 방지 전략이 필요합니다.',
          nextStep: 'step-3b-deadend'
        }
      ],
      hint: 'Cache stampede는 캐시 키가 만료되는 순간 대량의 요청이 동시에 DB로 몰리는 현상입니다. Stale-while-revalidate 또는 cache lock 패턴으로 방지할 수 있습니다.'
    },

    'step-2b': {
      title: 'RDS 메트릭 확인',
      description: 'RDS read replica의 CPU가 95%로 포화되고, SELECT 처리량이 2800 ops/s로 급증했습니다. Buffer cache hit ratio도 72%로 하락하여 디스크 I/O가 증가하고 있습니다. 하지만 이는 캐시 계층 문제의 결과로 보입니다.',
      metrics: [
        {
          title: 'RDS CPU & SELECT Throughput',
          chartType: 'line',
          chartConfig: {
            labels: ['14:00', '14:02', '14:04', '14:05', '14:06', '14:07', '14:08'],
            datasets: [
              {
                label: 'aws.rds.cpuutilization (%)',
                data: [25, 28, 30, 95, 98, 97, 94],
                borderColor: '#ef4444',
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                tension: 0.3,
                fill: true
              },
              {
                label: 'aws.rds.select_throughput (ops/s)',
                data: [200, 280, 350, 2800, 3200, 3000, 2600],
                borderColor: '#f59e0b',
                backgroundColor: 'rgba(245, 158, 11, 0.1)',
                tension: 0.3,
                fill: true
              }
            ]
          }
        },
        {
          title: 'Buffer Cache Hit Ratio & Disk Queue',
          chartType: 'line',
          chartConfig: {
            labels: ['14:00', '14:02', '14:04', '14:05', '14:06', '14:07', '14:08'],
            datasets: [
              {
                label: 'aws.rds.buffer_cache_hit_ratio (%)',
                data: [99.2, 99.1, 99.0, 72, 65, 68, 75],
                borderColor: '#8b5cf6',
                backgroundColor: 'rgba(139, 92, 246, 0.1)',
                tension: 0.3,
                fill: true
              },
              {
                label: 'aws.rds.disk_queue_depth',
                data: [2, 3, 4, 45, 62, 58, 42],
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
        { timestamp: '14:05:50', level: 'WARN', service: 'rds-read-replica', message: '[Performance] CPU: 95%, SELECT throughput: 2800 ops/s (baseline: 250 ops/s)' },
        { timestamp: '14:05:55', level: 'ERROR', service: 'rds-read-replica', message: '[InnoDB] Buffer pool hit rate dropped to 72% — excessive disk reads detected' },
        { timestamp: '14:06:00', level: 'INFO', service: 'datadog-rds', message: '[RDS Monitor] Active connections: 185/200, disk queue depth: 62 (threshold: 10)' }
      ],
      choices: [
        {
          text: 'Redis cache 계층 분석으로 전환',
          isOptimal: true,
          feedback: '올바른 판단입니다. RDS 부하는 cache miss의 결과입니다. 근본 원인을 찾기 위해 Redis cache 메트릭을 분석하세요.',
          nextStep: 'step-2a'
        }
      ],
      hint: 'RDS 부하가 급증했다면, 애플리케이션 계층(캐시, 쿼리 패턴)에서 근본 원인을 찾아야 합니다. Cache stampede는 DB 부하의 일반적인 원인입니다.'
    },

    'step-2c-deadend': {
      title: 'GraphQL 스케일아웃 — Dead End',
      description: 'graphql-api Pod를 3개에서 9개로 스케일아웃했지만, 응답 시간은 개선되지 않고 오히려 RDS 부하가 더 증가했습니다. Cache stampede 상황에서는 모든 서버가 동시에 cache miss를 겪으므로, 서버 수를 늘릴수록 DB로 가는 중복 쿼리가 비례 증가합니다.',
      isDeadEnd: true,
      metrics: [
        {
          title: '스케일아웃 후 RDS SELECT 처리량',
          chartType: 'line',
          chartConfig: {
            labels: ['14:10', '14:12', '14:14', '14:16', '14:18', '14:20'],
            datasets: [{
              label: 'aws.rds.select_throughput (ops/s) — 스케일아웃 후',
              data: [2800, 3200, 5800, 7200, 7800, 8000],
              borderColor: '#ef4444',
              backgroundColor: 'rgba(239, 68, 68, 0.1)',
              tension: 0.3,
              fill: true
            }]
          }
        }
      ],
      logs: [
        { timestamp: '14:12:00', level: 'INFO', service: 'k8s-hpa', message: '[HPA] graphql-api scaled from 3 to 9 replicas' },
        { timestamp: '14:14:30', level: 'ERROR', service: 'rds-read-replica', message: '[Performance] CPU: 98%, SELECT throughput: 7200 ops/s — load increased after scale-out!' },
        { timestamp: '14:16:00', level: 'WARN', service: 'graphql-api', message: '[All pods] Cache stampede: 9 pods × 2400 requests = 21600 redundant DB queries' }
      ],
      learningMoment: {
        title: 'Cache Stampede는 스케일아웃으로 악화된다',
        explanation: 'Cache stampede 상황에서는 모든 서버가 동시에 캐시 키 만료를 겪습니다. 서버 수를 늘리면 각 서버가 동일한 데이터를 DB에서 다시 조회하므로, 중복 쿼리가 서버 수에 비례하여 증가합니다. 근본 해결책은 stale-while-revalidate, cache lock, 또는 probabilistic early recomputation 같은 stampede 방지 패턴입니다.',
        moduleReference: '모듈 11: Cache Stampede 및 N+1 쿼리 최적화'
      },
      redirectTo: 'step-1',
      redirectMessage: '처음으로 돌아가서 캐시 계층의 근본 원인을 분석하세요.'
    },

    'step-3a': {
      title: 'APM Trace N+1 패턴',
      description: 'Datadog APM Trace를 분석한 결과, cache hit 시에는 SQL 쿼리가 0개, cache miss 시에도 DataLoader가 정상 작동하면 3개의 배치 쿼리만 발생합니다. 하지만 stampede 상황에서는 DataLoader의 maxBatchSize(25) 제한을 초과하여 96개의 개별 SELECT 쿼리로 폴백되고 있습니다.',
      metrics: [
        {
          title: 'SQL Queries per GraphQL Request',
          chartType: 'bar',
          chartConfig: {
            labels: ['정상 (cached)', '정상 (miss)', 'Stampede 시'],
            datasets: [{
              label: 'SQL queries per request',
              data: [0, 3, 96],
              backgroundColor: ['#10b981', '#3b82f6', '#ef4444']
            }]
          }
        },
        {
          title: 'Span Duration Breakdown',
          chartType: 'bar',
          chartConfig: {
            labels: ['graphql.parse', 'graphql.validate', 'graphql.execute', 'graphql.resolve'],
            datasets: [
              {
                label: 'Normal (ms)',
                data: [5, 8, 12, 120],
                backgroundColor: '#10b981'
              },
              {
                label: 'Stampede (ms)',
                data: [5, 8, 15, 5100],
                backgroundColor: '#ef4444'
              }
            ]
          }
        }
      ],
      logs: [
        { timestamp: '14:06:30', level: 'INFO', service: 'datadog-apm', message: '[APM Trace] trace_id: abc123 — graphql.resolve: 5.1s (96 SQL queries)' },
        { timestamp: '14:06:35', level: 'WARN', service: 'graphql-api', message: '[DataLoader] Batch overflow: requested 2400 product IDs, maxBatchSize: 25 — created 96 separate batches' },
        { timestamp: '14:06:40', level: 'ERROR', service: 'graphql-api', message: '[Performance] N+1 pattern detected: SELECT * FROM products WHERE id=? executed 96 times' },
        { timestamp: '14:06:45', level: 'INFO', service: 'graphql-api', message: '[Cache] Stampede prevention needed: implement stale-while-revalidate or cache lock' }
      ],
      choices: [
        {
          text: 'Stale-while-revalidate + Cache Lock + Batch 최적화 적용',
          isOptimal: true,
          feedback: '완벽한 해결책입니다. Stale-while-revalidate로 만료된 캐시를 일시적으로 제공하면서 백그라운드에서 갱신하고, cache lock으로 중복 갱신을 방지하며, DataLoader batch 크기를 늘려 N+1을 해결하세요.',
          nextStep: 'step-4a'
        }
      ],
      hint: 'Cache stampede를 방지하려면 (1) stale-while-revalidate로 만료 시점 분산, (2) cache lock으로 단일 갱신 보장, (3) DataLoader maxBatchSize 증가로 N+1 해결이 필요합니다.'
    },

    'step-3b-deadend': {
      title: 'TTL 증가 — Dead End',
      description: 'Redis 캐시 TTL을 5분에서 30분으로 증가시켰지만, 30분 후 캐시가 만료되는 순간 동일한 stampede가 재발했습니다. TTL을 아무리 늘려도 만료 시점에는 동일한 thundering herd 현상이 발생합니다.',
      isDeadEnd: true,
      metrics: [
        {
          title: 'TTL 증가 후 Stampede 재발',
          chartType: 'line',
          chartConfig: {
            labels: ['14:35', '14:40', '14:45', '14:50', '14:55', '15:00'],
            datasets: [{
              label: 'redis.keyspace_misses (/min) — TTL 30분 후',
              data: [80, 120, 150, 9500, 10200, 9800],
              borderColor: '#ef4444',
              backgroundColor: 'rgba(239, 68, 68, 0.1)',
              tension: 0.3,
              fill: true
            }]
          }
        }
      ],
      logs: [
        { timestamp: '14:35:00', level: 'INFO', service: 'redis-cluster', message: '[Config] TTL updated: catalog:* keys now expire after 30 minutes (was: 5 minutes)' },
        { timestamp: '14:50:05', level: 'ERROR', service: 'graphql-api', message: '[Cache] catalog:flash-sale:popular expired after 30min TTL — 2800 concurrent requests triggered stampede again' },
        { timestamp: '14:52:00', level: 'WARN', service: 'rds-read-replica', message: '[Performance] CPU: 96%, SELECT throughput: 3200 ops/s — stampede recurred' }
      ],
      learningMoment: {
        title: 'TTL 증가는 Stampede를 지연시킬 뿐 방지하지 못한다',
        explanation: 'TTL을 늘리면 stampede 발생 주기가 길어질 뿐, 캐시가 만료되는 순간에는 동일한 thundering herd가 발생합니다. 근본적인 해결책은 (1) stale-while-revalidate로 만료된 캐시를 일시적으로 제공하면서 백그라운드에서 갱신하거나, (2) cache lock으로 첫 번째 요청만 DB를 조회하고 나머지는 대기하도록 하는 것입니다.',
        moduleReference: '모듈 11: Cache Stampede 및 N+1 쿼리 최적화'
      },
      redirectTo: 'step-2a',
      redirectMessage: 'Redis 분석으로 돌아가서 stampede 방지 전략을 적용하세요.'
    },

    'step-4a': {
      title: 'Stale-while-revalidate + Cache Lock + Batch 최적화',
      description: '세 가지 최적화를 동시에 적용했습니다. (1) Stale-while-revalidate: 캐시 만료 시 stale 데이터를 즉시 반환하고 백그라운드에서 갱신, (2) Cache Lock: 동시 갱신 방지용 Redis SETNX 락, (3) DataLoader maxBatchSize를 25에서 500으로 증가. Cache hit ratio가 98%로 회복되고 p99 레이턴시가 148ms로 정상화되었습니다.',
      metrics: [
        {
          title: 'Recovery Timeline',
          chartType: 'line',
          chartConfig: {
            labels: ['14:25', '14:27', '14:29', '14:31', '14:33', '14:35'],
            datasets: [
              {
                label: 'cache hit ratio (%)',
                data: [12, 35, 65, 82, 92, 98],
                borderColor: '#10b981',
                backgroundColor: 'rgba(16, 185, 129, 0.1)',
                tension: 0.3,
                fill: true
              },
              {
                label: 'trace.graphql.p99_latency (ms)',
                data: [5500, 2800, 800, 250, 165, 148],
                borderColor: '#3b82f6',
                backgroundColor: 'rgba(59, 130, 246, 0.1)',
                tension: 0.3,
                fill: true
              }
            ]
          }
        },
        {
          title: 'Before vs After',
          chartType: 'bar',
          chartConfig: {
            labels: ['SQL queries/req', 'DataLoader batch', 'p99 latency (ms)', 'Cache hit ratio (%)'],
            datasets: [
              {
                label: 'Before',
                data: [96, 25, 5800, 12],
                backgroundColor: '#ef4444'
              },
              {
                label: 'After',
                data: [3, 500, 148, 98],
                backgroundColor: '#10b981'
              }
            ]
          }
        }
      ],
      logs: [
        { timestamp: '14:25:00', level: 'INFO', service: 'graphql-api', message: '[Cache] Deployed stale-while-revalidate middleware — serving stale data while refreshing in background' },
        { timestamp: '14:26:00', level: 'INFO', service: 'graphql-api', message: '[Cache Lock] Redis SETNX lock acquired for cache refresh — other requests will wait or use stale' },
        { timestamp: '14:27:00', level: 'INFO', service: 'graphql-api', message: '[DataLoader] maxBatchSize increased from 25 to 500 — N+1 fallback eliminated' },
        { timestamp: '14:30:00', level: 'INFO', service: 'datadog-apm', message: '[APM] p99 latency dropped from 5800ms to 250ms — cache stampede resolved' },
        { timestamp: '14:35:00', level: 'INFO', service: 'redis-cluster', message: '[Redis Stats] keyspace_hits: 7200/min, keyspace_misses: 150/min, hit_ratio: 98%' }
      ],
      choices: [
        {
          text: '재발 방지 대책 수립 및 사후 분석',
          isOptimal: true,
          feedback: '완벽합니다. 장애를 복구했으니 이제 재발 방지를 위한 장기 대책을 수립하고 팀 전체와 공유해야 합니다.',
          nextStep: 'step-final'
        }
      ],
      hint: 'Stale-while-revalidate는 사용자에게 빠른 응답을 제공하면서도 백그라운드에서 데이터를 갱신하는 효과적인 패턴입니다.'
    },

    'step-final': {
      title: '사후 분석 및 재발 방지',
      description: '장애가 완전히 복구되었습니다. 근본 원인은 flash sale 중 인기 상품 카탈로그 캐시(TTL 5분)가 만료되면서 2400건의 동시 요청이 cache miss를 겪었고, DataLoader의 maxBatchSize(25) 제한으로 96개의 N+1 쿼리가 발생하여 RDS read replica가 포화된 것입니다. Stale-while-revalidate + cache lock + batch 최적화로 해결했습니다.',
      isTerminal: true,
      rootCause: {
        title: 'Redis Cache Stampede + N+1 쿼리',
        summary: 'Flash sale 중 인기 상품 카탈로그 캐시(TTL 5분) 만료 시점에 2400건 동시 cache miss 발생 → DataLoader maxBatchSize(25) 초과로 N+1 개별 쿼리 폴백 → RDS read replica CPU 95% 포화',
        timeline: [
          { time: '14:00', event: 'Flash sale 시작, 트래픽 급증 (800 → 2400 req/min)' },
          { time: '14:05', event: 'catalog:flash-sale:popular 캐시 키 만료 (TTL 5분), 2400건 동시 cache miss' },
          { time: '14:05', event: 'DataLoader maxBatchSize(25) 초과, 96개 개별 SELECT 쿼리로 폴백 (N+1 패턴)' },
          { time: '14:05', event: 'RDS read replica CPU 95%, SELECT throughput 2800 ops/s 급증' },
          { time: '14:05', event: 'Datadog P1 알림 발생, GraphQL p99 레이턴시 4200ms (SLO: 500ms)' },
          { time: '14:06', event: 'APM Trace로 N+1 패턴 확인 (96 SQL queries per request)' },
          { time: '14:25', event: 'Stale-while-revalidate + cache lock + DataLoader batch(500) 배포' },
          { time: '14:35', event: 'Cache hit ratio 98% 회복, p99 레이턴시 148ms 정상화' }
        ],
        resolution: [
          '즉시 수정: Stale-while-revalidate 미들웨어 배포 — 만료된 캐시를 일시 제공하면서 백그라운드 갱신',
          'Cache Lock: Redis SETNX로 동시 갱신 방지 — 첫 번째 요청만 DB 조회, 나머지는 stale 제공',
          'DataLoader 최적화: maxBatchSize를 25에서 500으로 증가 — N+1 폴백 제거',
          'TTL Jitter: 캐시 만료 시점 분산 (TTL ± 10% randomization) — 동시 만료 방지',
          'Cache Warmup: Flash sale 시작 전 인기 상품 캐시 사전 로드 — 만료 전 갱신',
          '모니터링: redis.keyspace_misses 급증 알림 (임계값: 1000/min), dataloader.batch_size saturation 알림',
          'Load Test: Stampede 시뮬레이션 테스트 추가 (Locust + Redis FLUSHALL)',
          '문서화: Cache stampede 방지 패턴 가이드 작성, DataLoader best practices 공유'
        ]
      },
      postMortem: {
        template: {
          fields: [
            {
              label: 'Cache stampede란 무엇인가요? (간단히 설명)',
              type: 'textarea',
              placeholder: '캐시 키가 만료되는 순간 대량의 요청이 동시에 cache miss를 겪으면서 DB로 몰리는 현상',
              hint: 'Thundering herd 문제의 일종'
            },
            {
              label: 'Stale-while-revalidate 패턴의 핵심 원리는?',
              type: 'choice',
              options: [
                'TTL을 매우 길게 설정하여 만료를 방지',
                '만료된 캐시를 즉시 반환하고 백그라운드에서 갱신',
                '모든 요청을 대기시키고 첫 번째 요청만 처리',
                'Cache miss 시 DB 대신 디폴트 값 반환'
              ],
              correctAnswer: 1,
              hint: 'Stale 데이터를 활용하여 빠른 응답 제공'
            },
            {
              label: 'N+1 쿼리 문제가 발생하는 이유와 해결 방법은?',
              type: 'textarea',
              placeholder: '발생 이유: 반복문 내에서 개별 쿼리 실행, 또는 DataLoader batch 크기 부족. 해결: DataLoader/batching으로 여러 ID를 하나의 IN 쿼리로 묶기',
              hint: 'GraphQL에서 흔한 성능 문제'
            },
            {
              label: '이번 장애에서 배운 핵심 교훈 3가지를 작성하세요.',
              type: 'textarea',
              placeholder: '1. Cache stampede는 TTL 증가로 해결 불가, stale-while-revalidate 필요\n2. DataLoader batch 크기는 실제 트래픽에 맞게 설정\n3. Flash sale 같은 트래픽 급증 이벤트 전 cache warmup',
              hint: '캐시 전략, DataLoader 설정, 사전 준비 관점에서 생각해보세요'
            }
          ]
        }
      }
    }
  }
};
