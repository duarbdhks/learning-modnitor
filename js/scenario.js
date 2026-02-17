var ScenarioEngine = {
  container: null,
  data: null,
  moduleId: null,
  currentStepId: null,
  stepsVisited: [],
  deadEndsHit: 0,
  hintsUsed: 0,
  chartInstances: [],
  sessionKey: '',
  postMortemStorageKey: '',

  init: function(containerId, scenarioData, moduleId) {
    this.container = document.getElementById(containerId);
    if (!this.container) return;
    this.data = scenarioData;
    this.moduleId = moduleId;
    this.sessionKey = 'scenario-session-' + moduleId;
    this.postMortemStorageKey = 'scenario-postmortem-' + moduleId;
    this.stepsVisited = [];
    this.deadEndsHit = 0;
    this.hintsUsed = 0;
    this.chartInstances = [];

    var completeBtn = document.getElementById('complete-btn');
    if (completeBtn) completeBtn.parentElement.style.display = 'none';

    var saved = this.restoreState();
    if (saved && saved.currentStepId && this.data.steps[saved.currentStepId]) {
      this.stepsVisited = saved.stepsVisited || [];
      this.deadEndsHit = saved.deadEndsHit || 0;
      this.hintsUsed = saved.hintsUsed || 0;
      this.renderAlert(function() {
        ScenarioEngine.renderBriefing(function() {
          ScenarioEngine.renderStep(saved.currentStepId);
        });
      });
    } else {
      this.renderAlert(function() {
        ScenarioEngine.renderBriefing(function() {
          ScenarioEngine.renderStep(Object.keys(ScenarioEngine.data.steps)[0]);
        });
      });
    }
  },

  destroyCharts: function() {
    this.chartInstances.forEach(function(c) {
      if (c && typeof c.destroy === 'function') c.destroy();
    });
    this.chartInstances = [];
  },

  saveState: function() {
    try {
      sessionStorage.setItem(this.sessionKey, JSON.stringify({
        currentStepId: this.currentStepId,
        stepsVisited: this.stepsVisited,
        deadEndsHit: this.deadEndsHit,
        hintsUsed: this.hintsUsed
      }));
    } catch(e) {}
  },

  restoreState: function() {
    try {
      var d = sessionStorage.getItem(this.sessionKey);
      return d ? JSON.parse(d) : null;
    } catch(e) { return null; }
  },

  clearState: function() {
    try { sessionStorage.removeItem(this.sessionKey); } catch(e) {}
  },

  getPostMortemFieldId: function(field, idx) {
    var raw = field && field.id ? String(field.id) : ('field-' + (idx + 1));
    return raw.replace(/[^a-zA-Z0-9_-]/g, '-');
  },

  validatePostMortemTemplate: function(postMortem) {
    var issues = [];
    if (!postMortem || typeof postMortem !== 'object') {
      issues.push('Post-mortem 설정이 없습니다.');
      return {
        valid: false,
        issues: issues,
        fieldIds: []
      };
    }

    if (!postMortem.template || !Array.isArray(postMortem.template.fields) || postMortem.template.fields.length === 0) {
      issues.push('Post-mortem template.fields가 비어 있습니다.');
      return {
        valid: false,
        issues: issues,
        fieldIds: []
      };
    }

    var fieldIds = [];
    var duplicates = {};
    var self = this;
    postMortem.template.fields.forEach(function(field, idx) {
      var fieldId = self.getPostMortemFieldId(field, idx);
      if (duplicates[fieldId]) {
        issues.push('template fieldId 중복: ' + fieldId);
      }
      duplicates[fieldId] = true;
      fieldIds.push(fieldId);
    });

    if (!postMortem.rubric || !Array.isArray(postMortem.rubric.criteria) || postMortem.rubric.criteria.length === 0) {
      issues.push('Rubric 기준이 없어 채점 기준이 적용되지 않습니다.');
      return {
        valid: issues.length === 0,
        issues: issues,
        fieldIds: fieldIds
      };
    }

    postMortem.rubric.criteria.forEach(function(criteria, idx) {
      var criteriaFieldIds = [];
      if (Array.isArray(criteria.fieldIds)) {
        criteriaFieldIds = criteria.fieldIds.map(self.normalizePostMortemFieldId.bind(self));
      }
      if (criteria.fieldId) {
        criteriaFieldIds.push(self.normalizePostMortemFieldId(criteria.fieldId));
      }

      if (criteriaFieldIds.length === 0) {
        return;
      }

      criteriaFieldIds.forEach(function(fieldId) {
        if (fieldIds.indexOf(fieldId) === -1) {
          issues.push('Rubric 기준 #' + (idx + 1) + '에서 template에 없는 fieldId 사용: ' + fieldId);
        }
      });
    });

    return {
      valid: issues.length === 0,
      issues: issues,
      fieldIds: fieldIds
    };
  },

  normalizePostMortemFieldId: function(fieldId) {
    return String(fieldId || '').replace(/[^a-zA-Z0-9_-]/g, '-');
  },

  restorePostMortemState: function() {
    var fromSession = null;
    var fromLocal = null;
    try {
      var s = sessionStorage.getItem(this.postMortemStorageKey);
      fromSession = s ? JSON.parse(s) : null;
    } catch(e) {}
    try {
      var l = localStorage.getItem(this.postMortemStorageKey);
      fromLocal = l ? JSON.parse(l) : null;
    } catch(e) {}

    if (fromSession && fromLocal) {
      var sessionTs = fromSession.updatedAt ? Date.parse(fromSession.updatedAt) : 0;
      var localTs = fromLocal.updatedAt ? Date.parse(fromLocal.updatedAt) : 0;
      if (isNaN(sessionTs)) sessionTs = 0;
      if (isNaN(localTs)) localTs = 0;
      return sessionTs >= localTs ? fromSession : fromLocal;
    }
    return fromSession || fromLocal || null;
  },

  persistPostMortemState: function(postMortemAnswers, rubricResult) {
    var payload = {
      postMortemAnswers: postMortemAnswers || {},
      rubricScore: rubricResult ? rubricResult.rubricScore : null,
      feedback: rubricResult ? rubricResult.feedback : null,
      updatedAt: new Date().toISOString()
    };
    try { sessionStorage.setItem(this.postMortemStorageKey, JSON.stringify(payload)); } catch(e) {}
    try { localStorage.setItem(this.postMortemStorageKey, JSON.stringify(payload)); } catch(e) {}
    return payload;
  },

  collectPostMortemAnswers: function() {
    var answers = {};
    if (!this.container) return answers;
    this.container.querySelectorAll('.postmortem-textarea[data-field-id]').forEach(function(textarea) {
      var fieldId = textarea.getAttribute('data-field-id');
      answers[fieldId] = textarea.value || '';
    });
    return answers;
  },

  evaluatePostMortemRubric: function(pm, answers) {
    if (!pm || !pm.template || !Array.isArray(pm.template.fields) || pm.template.fields.length === 0) {
      return { rubricScore: null, feedback: null };
    }

    var rubric = pm.rubric;
    if (rubric && Array.isArray(rubric.criteria) && rubric.criteria.length > 0) {
      var totalPoints = 0;
      var earnedPoints = 0;
      var unmet = [];
      var self = this;

      rubric.criteria.forEach(function(criteria, idx) {
        var points = typeof criteria.points === 'number' ? criteria.points : 1;
        totalPoints += points;

        var targetTexts = [];
        if (Array.isArray(criteria.fieldIds) && criteria.fieldIds.length > 0) {
          criteria.fieldIds.forEach(function(fid) {
            var normalizedFieldId = self.normalizePostMortemFieldId(fid);
            targetTexts.push(String(answers[normalizedFieldId] || ''));
          });
        } else if (criteria.fieldId) {
          var criteriaFieldId = self.normalizePostMortemFieldId(criteria.fieldId);
          targetTexts.push(String(answers[criteriaFieldId] || ''));
        } else {
          pm.template.fields.forEach(function(f, fieldIdx) {
            var fieldId = self.getPostMortemFieldId(f, fieldIdx);
            targetTexts.push(String(answers[fieldId] || ''));
          });
        }
        var target = targetTexts.join(' ').toLowerCase();

        var passed = false;
        if (criteria.regex) {
          try {
            var regex = new RegExp(String(criteria.regex), criteria.flags || 'i');
            passed = regex.test(target);
          } catch(e) {
            passed = false;
          }
        } else if (Array.isArray(criteria.keywords) && criteria.keywords.length > 0) {
          var keywordMatches = criteria.keywords.filter(function(k) {
            return target.indexOf(String(k).toLowerCase()) !== -1;
          }).length;
          var required = typeof criteria.minMatch === 'number'
            ? Math.max(1, criteria.minMatch)
            : (criteria.match === 'all' ? criteria.keywords.length : 1);
          passed = keywordMatches >= required;
        } else {
          passed = target.trim().length > 0;
        }

        if (passed) {
          earnedPoints += points;
        } else {
          unmet.push(criteria.label || ('기준 ' + (idx + 1)));
        }
      });

      var rubricScore = totalPoints > 0 ? Math.round((earnedPoints / totalPoints) * 100) : 0;
      var level = rubricScore >= 85 ? 'excellent' : (rubricScore >= 70 ? 'good' : (rubricScore >= 50 ? 'fair' : 'needs_improvement'));
      var summary = rubricScore >= 85
        ? '핵심 항목이 충분히 포함되었습니다.'
        : (rubricScore >= 70 ? '전반적으로 좋지만 일부 항목 보강이 필요합니다.' : '핵심 근거가 부족합니다. 항목별 내용을 보강하세요.');
      var details = [];
      if (unmet.length > 0) details.push('보강 필요 기준: ' + unmet.join(', '));

      return {
        rubricScore: rubricScore,
        feedback: {
          level: level,
          summary: summary,
          details: details
        }
      };
    }

    var totalFields = pm.template.fields.length;
    var answered = 0;
    var detailed = 0;
    var missing = [];
    var that = this;

    pm.template.fields.forEach(function(field, idx) {
      var fieldId = that.getPostMortemFieldId(field, idx);
      var value = String((answers && answers[fieldId]) || '').trim();
      if (value.length > 0) {
        answered++;
        if (value.length >= 40) detailed++;
      } else {
        missing.push(field.label || ('항목 ' + (idx + 1)));
      }
    });

    var coverageScore = Math.round((answered / totalFields) * 70);
    var depthScore = Math.round((detailed / totalFields) * 30);
    var score = coverageScore + depthScore;
    var feedbackLevel = score >= 85 ? 'excellent' : (score >= 70 ? 'good' : (score >= 50 ? 'fair' : 'needs_improvement'));
    var feedbackSummary = score >= 85
      ? '구조가 명확하고 핵심 내용이 잘 정리되었습니다.'
      : (score >= 70 ? '핵심 항목은 작성되었으며 세부 근거를 조금 더 보강하면 좋습니다.' : '누락 항목 또는 상세 근거가 부족합니다.');
    var feedbackDetails = [];
    if (missing.length > 0) {
      feedbackDetails.push('누락 항목: ' + missing.join(', '));
    }
    if (answered > detailed) {
      feedbackDetails.push('각 항목에 수치, 시각, 재현 조건 등 구체 정보를 추가하세요.');
    }

    return {
      rubricScore: score,
      feedback: {
        level: feedbackLevel,
        summary: feedbackSummary,
        details: feedbackDetails
      }
    };
  },

  renderPostMortemFeedback: function(rubricResult) {
    var feedbackEl = this.container ? this.container.querySelector('#postmortem-rubric-feedback') : null;
    if (!feedbackEl || !rubricResult || rubricResult.rubricScore === null || !rubricResult.feedback) return;

    var score = rubricResult.rubricScore;
    var feedback = rubricResult.feedback;
    var colorClass = score >= 85 ? 'text-emerald-400' : (score >= 70 ? 'text-blue-400' : (score >= 50 ? 'text-amber-400' : 'text-red-400'));
    var detailsHtml = '';
    if (Array.isArray(feedback.details) && feedback.details.length > 0) {
      detailsHtml = '<ul class="mt-2 space-y-1 text-xs text-gray-400">' +
        feedback.details.map(function(d) { return '<li>&#8226; ' + d + '</li>'; }).join('') +
        '</ul>';
    }

    feedbackEl.innerHTML =
      '<div class="mt-6 rounded-lg border border-gray-800 bg-gray-900/60 p-4">' +
      '<div class="flex items-center justify-between">' +
      '<span class="text-sm font-semibold text-gray-200">Post-mortem Rubric</span>' +
      '<span class="text-sm font-bold ' + colorClass + '">' + score + ' / 100</span>' +
      '</div>' +
      '<p class="text-xs text-gray-300 mt-2">' + feedback.summary + '</p>' +
      detailsHtml +
      '</div>';
  },

  saveScenarioResult: function(score, postMortemAnswers, rubricResult) {
    if (!this.moduleId || typeof ProgressTracker === 'undefined') return;
    ProgressTracker.saveScenarioScore(this.moduleId, {
      grade: score.grade,
      label: score.label,
      steps: score.steps,
      hintsUsed: this.hintsUsed,
      deadEndsHit: this.deadEndsHit,
      postMortemAnswers: postMortemAnswers || {},
      rubricScore: rubricResult ? rubricResult.rubricScore : null,
      feedback: rubricResult ? rubricResult.feedback : null
    });
  },

  bindPostMortemForm: function(pm, score) {
    if (!pm || !pm.template || !Array.isArray(pm.template.fields) || pm.template.fields.length === 0) return;

    var saved = this.restorePostMortemState();
    var initialAnswers = saved && saved.postMortemAnswers ? saved.postMortemAnswers : {};
    var self = this;

    var stateCleared = false;
    this.container.querySelectorAll('.postmortem-textarea[data-field-id]').forEach(function(textarea) {
      var fieldId = textarea.getAttribute('data-field-id');
      if (Object.prototype.hasOwnProperty.call(initialAnswers, fieldId)) {
        textarea.value = initialAnswers[fieldId];
      }
      textarea.addEventListener('input', function() {
        var answers = self.collectPostMortemAnswers();
        var rubricResult = self.evaluatePostMortemRubric(pm, answers);
        self.persistPostMortemState(answers, rubricResult);
        self.renderPostMortemFeedback(rubricResult);
        self.saveScenarioResult(score, answers, rubricResult);
        if (!stateCleared) {
          stateCleared = true;
          self.clearState();
        }
      });
    });

    var rubricResult = this.evaluatePostMortemRubric(pm, initialAnswers);
    this.persistPostMortemState(initialAnswers, rubricResult);
    this.renderPostMortemFeedback(rubricResult);
    this.saveScenarioResult(score, initialAnswers, rubricResult);
  },

  renderAlert: function(onContinue) {
    var a = this.data.alert;
    var sevClass = 'severity-' + (a.severity || 'critical');
    var sevLabel = { critical: 'CRITICAL', warning: 'WARNING', emergency: 'EMERGENCY' };
    var sevColors = { critical: '#ef4444', warning: '#fbbf24', emergency: '#dc2626' };

    var html = '<div class="scenario-alert ' + sevClass + '">';
    html += '<div class="flex items-center gap-3 mb-3">';
    html += '<div class="flex items-center gap-2">';
    html += '<span class="inline-block w-2 h-2 rounded-full animate-pulse" style="background:' + (sevColors[a.severity] || '#ef4444') + '"></span>';
    html += '<span class="text-xs font-bold tracking-wider uppercase" style="color:' + (sevColors[a.severity] || '#ef4444') + '">' + (sevLabel[a.severity] || 'ALERT') + '</span>';
    html += '</div>';
    html += '<span class="text-xs text-gray-500">' + (a.source || 'Monitoring') + '</span>';
    html += '<span class="text-xs text-gray-600">' + (a.timestamp || '') + '</span>';
    html += '</div>';
    html += '<h3 class="text-lg font-bold text-white mb-2">' + a.title + '</h3>';
    html += '<p class="text-sm text-gray-400 mb-3">' + a.message + '</p>';
    if (a.metric) {
      html += '<div class="flex items-center gap-4 text-xs">';
      html += '<span class="text-gray-500">' + a.metric.name + '</span>';
      html += '<span class="font-mono font-bold" style="color:' + (sevColors[a.severity] || '#ef4444') + '">' + a.metric.value + ' ' + (a.metric.unit || '') + '</span>';
      html += '<span class="text-gray-600">threshold: ' + a.metric.threshold + ' ' + (a.metric.unit || '') + '</span>';
      html += '</div>';
    }
    if (a.tags) {
      html += '<div class="flex flex-wrap gap-1.5 mt-3">';
      a.tags.forEach(function(tag) {
        html += '<span class="px-2 py-0.5 text-xs rounded bg-gray-800 text-gray-400 border border-gray-700">' + tag + '</span>';
      });
      html += '</div>';
    }
    html += '</div>';
    html += '<div class="flex justify-center mt-6">';
    html += '<button id="scenario-start-btn" class="px-6 py-3 bg-amber-600 hover:bg-amber-500 text-white font-semibold rounded-xl transition-all duration-200 transform hover:scale-105">';
    html += '조사 시작하기</button></div>';

    this.container.innerHTML = html;
    var btn = document.getElementById('scenario-start-btn');
    if (btn) {
      btn.addEventListener('click', function() {
        if (onContinue) onContinue();
      });
    }
  },

  renderBriefing: function(onContinue) {
    var b = this.data.briefing;
    if (!b) { if (onContinue) onContinue(); return; }

    var html = '<div class="scenario-briefing mb-8">';
    html += '<div class="flex items-center gap-2 mb-4">';
    html += '<svg class="w-5 h-5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>';
    html += '<h3 class="text-lg font-bold text-white">상황 브리핑</h3>';
    html += '</div>';
    html += '<p class="text-gray-300 leading-relaxed mb-4">' + b.description + '</p>';
    if (b.environment) {
      html += '<div class="bg-gray-900/50 rounded-lg border border-gray-800 p-4">';
      html += '<h4 class="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-3">환경 정보</h4>';
      if (b.environment.services) {
        html += '<div class="mb-2"><span class="text-xs text-gray-500">Services:</span>';
        html += '<div class="flex flex-wrap gap-1.5 mt-1">';
        b.environment.services.forEach(function(s) {
          html += '<span class="px-2 py-0.5 text-xs rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">' + s + '</span>';
        });
        html += '</div></div>';
      }
      if (b.environment.infra) {
        html += '<div class="mb-2"><span class="text-xs text-gray-500">Infra:</span> <span class="text-xs text-gray-300">' + b.environment.infra + '</span></div>';
      }
      if (b.environment.monitoring) {
        html += '<div><span class="text-xs text-gray-500">Monitoring:</span> <span class="text-xs text-gray-300">' + b.environment.monitoring + '</span></div>';
      }
      html += '</div>';
    }
    html += '</div>';

    html += '<div class="flex justify-center mt-6">';
    html += '<button id="briefing-continue-btn" class="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-lg transition-all">조사 시작</button>';
    html += '</div>';

    this.container.innerHTML = html;

    document.getElementById('briefing-continue-btn').addEventListener('click', function() {
      if (onContinue) onContinue();
    });
  },

  renderStep: function(stepId) {
    var step = this.data.steps[stepId];
    if (!step) return;

    window.scrollTo({ top: 0, behavior: 'smooth' });
    this.destroyCharts();
    this.currentStepId = stepId;
    if (this.stepsVisited.indexOf(stepId) === -1) {
      this.stepsVisited.push(stepId);
    }
    this.saveState();
    this.updateSidebar();

    if (step.isDeadEnd) {
      this.renderDeadEnd(step);
      return;
    }
    if (step.isTerminal) {
      this.renderResults(step);
      return;
    }

    var html = '';
    html += '<div class="scenario-step animate-fade-in">';
    html += '<div class="flex items-center gap-3 mb-6">';
    html += '<div class="w-10 h-10 rounded-lg bg-amber-500/20 flex items-center justify-center">';
    html += '<span class="text-amber-400 font-bold text-lg">' + this.stepsVisited.length + '</span>';
    html += '</div>';
    html += '<h2 class="text-2xl font-bold text-gray-100">' + step.title + '</h2>';
    html += '</div>';

    if (step.description) {
      html += '<p class="text-gray-300 leading-relaxed mb-6">' + step.description + '</p>';
    }

    if (step.metrics && step.metrics.length > 0) {
      html += '<div class="grid gap-4 mb-6 ' + (step.metrics.length > 1 ? 'sm:grid-cols-2' : '') + '">';
      step.metrics.forEach(function(m, i) {
        html += '<div class="metric-panel">';
        html += '<div class="metric-panel-header">';
        html += '<span class="text-sm font-semibold text-gray-200">' + m.title + '</span>';
        html += '</div>';
        html += '<div class="metric-panel-body">';
        html += '<canvas id="chart-' + stepId + '-' + i + '"></canvas>';
        html += '</div></div>';
      });
      html += '</div>';
    }

    if (step.logs && step.logs.length > 0) {
      html += this.buildLogPanel(step.logs);
    }

    if (step.choices && step.choices.length > 0) {
      html += '<div class="mt-8 mb-4">';
      html += '<h3 class="text-lg font-semibold text-gray-200 mb-4">다음에 무엇을 조사하시겠습니까?</h3>';
      html += '<div class="space-y-3">';
      step.choices.forEach(function(c, idx) {
        html += '<div class="decision-card" data-choice="' + idx + '">';
        html += '<div class="flex items-center gap-3">';
        html += '<div class="w-8 h-8 rounded-lg bg-gray-800 flex items-center justify-center text-sm font-bold text-gray-400">' + String.fromCharCode(65 + idx) + '</div>';
        html += '<span class="text-gray-200">' + c.text + '</span>';
        html += '</div></div>';
      });
      html += '</div></div>';

      if (step.hint) {
        html += '<div class="mt-4 text-center">';
        html += '<button id="hint-btn" class="text-sm text-gray-500 hover:text-amber-400 transition-colors">';
        html += '<svg class="w-4 h-4 inline mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"/></svg>';
        html += '힌트 보기</button>';
        html += '<div id="hint-content" class="hidden mt-3 scenario-hint">' + step.hint + '</div>';
        html += '</div>';
      }
    }

    html += '<div id="choice-feedback" class="hidden mt-6"></div>';
    html += '</div>';

    this.container.innerHTML = html;

    var self = this;
    if (step.metrics && step.metrics.length > 0) {
      setTimeout(function() {
        step.metrics.forEach(function(m, i) {
          self.renderChart('chart-' + stepId + '-' + i, m);
        });
      }, 100);
    }

    this.container.querySelectorAll('.decision-card').forEach(function(card) {
      card.addEventListener('click', function() {
        var idx = parseInt(this.dataset.choice);
        self.handleChoice(idx);
      });
    });

    var hintBtn = document.getElementById('hint-btn');
    if (hintBtn) {
      hintBtn.addEventListener('click', function() {
        var content = document.getElementById('hint-content');
        if (content) {
          content.classList.toggle('hidden');
          if (!content.classList.contains('hidden') && !hintBtn.dataset.revealed) {
            hintBtn.dataset.revealed = '1';
            self.hintsUsed++;
            self.saveState();
          }
        }
      });
    }
  },

  renderChart: function(canvasId, metricConfig) {
    var canvas = document.getElementById(canvasId);
    if (!canvas || typeof Chart === 'undefined') return;

    var cfg = metricConfig.chartConfig;
    if (!cfg) return;

    var chartType = metricConfig.chartType || 'line';
    var isPieOrDoughnut = chartType === 'pie' || chartType === 'doughnut';

    var datasets = (cfg.datasets || []).map(function(ds) {
      if (isPieOrDoughnut) {
        return Object.assign({}, { borderWidth: ds.borderWidth || 2 }, ds);
      }
      return Object.assign({}, {
        fill: ds.fill || false,
        tension: ds.tension || 0.3,
        borderWidth: ds.borderWidth || 2,
        pointRadius: ds.pointRadius !== undefined ? ds.pointRadius : 3,
        pointHoverRadius: 5
      }, ds);
    });

    var options = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          labels: { color: '#9ca3af', font: { size: 11 } }
        },
        tooltip: {
          backgroundColor: '#1f2937',
          titleColor: '#e5e7eb',
          bodyColor: '#d1d5db',
          borderColor: '#374151',
          borderWidth: 1
        }
      }
    };

    if (!isPieOrDoughnut) {
      options.interaction = { intersect: false, mode: 'index' };
      options.scales = {
        x: {
          ticks: { color: '#6b7280', font: { size: 10 } },
          grid: { color: 'rgba(75,85,99,0.3)' }
        },
        y: {
          ticks: { color: '#6b7280', font: { size: 10 } },
          grid: { color: 'rgba(75,85,99,0.3)' }
        }
      };
    }

    if (metricConfig.annotations && typeof chartjsPluginAnnotation !== 'undefined') {
      options.plugins.annotation = { annotations: {} };
      metricConfig.annotations.forEach(function(ann, i) {
        if (ann.type === 'line') {
          options.plugins.annotation.annotations['ann' + i] = {
            type: 'line',
            xMin: ann.x, xMax: ann.x,
            borderColor: ann.color || '#fbbf24',
            borderWidth: 2,
            borderDash: [4, 4],
            label: {
              display: true,
              content: ann.label || '',
              position: 'start',
              backgroundColor: 'rgba(0,0,0,0.7)',
              color: '#fff',
              font: { size: 10 }
            }
          };
        }
      });
    }

    canvas.parentElement.style.height = '200px';

    var chart = new Chart(canvas, {
      type: metricConfig.chartType || 'line',
      data: { labels: cfg.labels || [], datasets: datasets },
      options: options
    });
    this.chartInstances.push(chart);
  },

  buildLogPanel: function(logs) {
    var html = '<div class="log-panel mb-6">';
    html += '<div class="log-panel-header">';
    html += '<span class="dot dot-red"></span>';
    html += '<span class="dot dot-yellow"></span>';
    html += '<span class="dot dot-green"></span>';
    html += '<span class="text-xs text-gray-400 ml-2">Application Logs</span>';
    html += '</div>';
    html += '<div class="log-panel-body">';
    logs.forEach(function(log) {
      var levelClass = 'log-level-' + (log.level || 'info').toLowerCase();
      html += '<div class="log-entry">';
      html += '<span class="log-timestamp">' + (log.timestamp || '') + '</span> ';
      html += '<span class="' + levelClass + '">[' + (log.level || 'INFO') + ']</span> ';
      if (log.source) html += '<span class="log-source">' + log.source + '</span> ';
      html += '<span class="log-message">' + log.message + '</span>';
      html += '</div>';
    });
    html += '</div></div>';
    return html;
  },

  handleChoice: function(idx) {
    var step = this.data.steps[this.currentStepId];
    if (!step || !step.choices || !step.choices[idx]) return;

    var choice = step.choices[idx];
    var selectedCard = this.container.querySelector('.decision-card[data-choice="' + idx + '"]');

    var existingNext = this.container.querySelector('.choice-next-btn');
    if (existingNext) existingNext.remove();

    var feedbackEl = document.getElementById('choice-feedback');
    if (feedbackEl && choice.feedback) {
      var fbClass = choice.isOptimal ? 'feedback-optimal' : 'feedback-suboptimal';
      var fbIcon = choice.isOptimal ? '&#10003;' : '&#10007;';
      feedbackEl.innerHTML = '<div class="scenario-feedback ' + fbClass + '">' +
        '<span class="feedback-icon">' + fbIcon + '</span> ' + choice.feedback + '</div>';
      feedbackEl.classList.remove('hidden');
    }

    if (choice.isOptimal) {
      this.container.querySelectorAll('.decision-card').forEach(function(card) {
        card.style.pointerEvents = 'none';
        card.style.opacity = '0.5';
      });
      if (selectedCard) {
        selectedCard.style.opacity = '1';
        selectedCard.classList.add('selected', 'optimal');
      }

      var self = this;
      var nextBtn = document.createElement('div');
      nextBtn.className = 'flex justify-center mt-6 choice-next-btn';
      nextBtn.innerHTML = '<button class="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-lg transition-all">다음 단계로</button>';
      feedbackEl.after(nextBtn);
      nextBtn.querySelector('button').addEventListener('click', function() {
        self.renderStep(choice.nextStep);
      });
    } else {
      if (selectedCard) {
        selectedCard.classList.add('tried', 'deadend');
      }
      this.deadEndsHit++;
      this.saveState();

      var self = this;
      var nextStep = this.data.steps[choice.nextStep];
      if (nextStep && nextStep.isDeadEnd) {
        var navBtn = document.createElement('div');
        navBtn.className = 'flex justify-center mt-6 choice-next-btn';
        navBtn.innerHTML = '<button class="px-6 py-2.5 bg-amber-600 hover:bg-amber-500 text-white font-semibold rounded-lg transition-all">이 경로 확인하기</button>';
        feedbackEl.after(navBtn);
        navBtn.querySelector('button').addEventListener('click', function() {
          self.renderDeadEnd(nextStep);
        });
      } else if (choice.nextStep) {
        var navBtn = document.createElement('div');
        navBtn.className = 'flex justify-center mt-6 choice-next-btn';
        navBtn.innerHTML = '<button class="px-6 py-2.5 bg-gray-600 hover:bg-gray-500 text-white font-semibold rounded-lg transition-all">이 경로로 진행</button>';
        feedbackEl.after(navBtn);
        navBtn.querySelector('button').addEventListener('click', function() {
          self.renderStep(choice.nextStep);
        });
      }
    }
  },

  renderDeadEnd: function(step) {
    var html = '<div class="dead-end-panel animate-fade-in">';
    html += '<div class="flex items-center gap-3 mb-4">';
    html += '<div class="w-10 h-10 rounded-lg bg-red-500/20 flex items-center justify-center">';
    html += '<svg class="w-5 h-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"/></svg>';
    html += '</div>';
    html += '<h2 class="text-2xl font-bold text-gray-100">' + step.title + '</h2>';
    html += '</div>';

    if (step.description) {
      html += '<p class="text-gray-300 leading-relaxed mb-6">' + step.description + '</p>';
    }

    if (step.learningMoment) {
      html += '<div class="learning-moment">';
      html += '<h3 class="text-amber-400 font-semibold mb-2">' + step.learningMoment.title + '</h3>';
      html += '<p class="text-gray-300 text-sm leading-relaxed">' + step.learningMoment.explanation + '</p>';
      if (step.learningMoment.moduleReference) {
        html += '<p class="text-xs text-gray-500 mt-2">' + step.learningMoment.moduleReference + '</p>';
      }
      html += '</div>';
    }

    var self = this;
    html += '<div class="flex justify-center mt-8">';
    html += '<button id="deadend-back-btn" class="px-6 py-2.5 bg-amber-600 hover:bg-amber-500 text-white font-semibold rounded-lg transition-all">';
    html += (step.redirectMessage || '이전 단계로 돌아가기') + '</button></div>';
    html += '</div>';

    this.container.innerHTML = html;

    document.getElementById('deadend-back-btn').addEventListener('click', function() {
      self.renderStep(step.redirectTo);
    });
  },

  renderResults: function(step) {
    var score = this.calculateScore();
    var rc = step.rootCause;
    var savedPostMortem = this.restorePostMortemState();
    var postMortemAnswers = savedPostMortem && savedPostMortem.postMortemAnswers ? savedPostMortem.postMortemAnswers : {};
    var rubricResult = this.evaluatePostMortemRubric(step.postMortem, postMortemAnswers);

    var html = '<div class="scenario-results animate-fade-in">';
    html += '<div class="text-center mb-8">';
    html += '<div class="scenario-grade grade-' + score.grade + '">' + score.grade + '</div>';
    html += '<h2 class="text-2xl font-bold text-white mb-1">조사 완료</h2>';
    html += '<p class="text-gray-400 text-sm">' + score.label + ' - ' + score.steps + '단계 / 힌트 ' + this.hintsUsed + '회 / 오답 ' + this.deadEndsHit + '회</p>';
    html += '</div>';

    if (rc) {
      html += '<div class="mb-8">';
      html += '<h3 class="text-xl font-bold text-red-400 mb-3">근본 원인: ' + rc.title + '</h3>';
      html += '<p class="text-gray-300 leading-relaxed mb-4">' + rc.summary + '</p>';

      if (rc.timeline && rc.timeline.length > 0) {
        html += '<div class="bg-gray-900/50 rounded-xl border border-gray-800 p-5 mb-4">';
        html += '<h4 class="text-sm font-semibold text-gray-400 mb-3">장애 타임라인</h4>';
        html += '<div class="space-y-3">';
        rc.timeline.forEach(function(t) {
          html += '<div class="flex gap-3">';
          html += '<span class="text-xs font-mono text-amber-400 whitespace-nowrap pt-0.5">' + t.time + '</span>';
          html += '<span class="text-sm text-gray-300">' + t.event + '</span>';
          html += '</div>';
        });
        html += '</div></div>';
      }

      if (rc.resolution && rc.resolution.length > 0) {
        html += '<div class="bg-gray-900/50 rounded-xl border border-green-900/30 p-5">';
        html += '<h4 class="text-sm font-semibold text-green-400 mb-3">해결 방안</h4>';
        html += '<ul class="space-y-2">';
        rc.resolution.forEach(function(r) {
          html += '<li class="flex items-start gap-2 text-sm text-gray-300"><span class="text-green-400 mt-0.5">&#8226;</span>' + r + '</li>';
        });
        html += '</ul></div>';
      }
      html += '</div>';
    }

    if (step.postMortem) {
      html += this.buildPostMortem(step.postMortem);
    }

    html += '</div>';
    this.container.innerHTML = html;

    var completeBtn = document.getElementById('complete-btn');
    if (completeBtn) completeBtn.parentElement.style.display = '';

    var hasPostMortemForm = !!(step.postMortem && step.postMortem.template && Array.isArray(step.postMortem.template.fields) && step.postMortem.template.fields.length > 0);
    if (hasPostMortemForm) {
      this.bindPostMortemForm(step.postMortem, score);
    } else {
      this.saveScenarioResult(score, postMortemAnswers, rubricResult);
      this.clearState();
    }
  },

  buildPostMortem: function(pm) {
    if (!pm || !pm.template || !pm.template.fields) return '';
    var html = '<div class="postmortem-form mt-8">';
    html += '<h3 class="text-lg font-bold text-white mb-4">Post-mortem 작성 연습</h3>';
    html += '<p class="text-sm text-gray-400 mb-4">실제 업무처럼 Post-mortem 문서를 작성해보세요.</p>';
    var self = this;
    pm.template.fields.forEach(function(f, idx) {
      var fieldId = self.getPostMortemFieldId(f, idx);
      html += '<div class="mb-4">';
      html += '<label class="block text-sm font-medium text-gray-300 mb-1.5">' + f.label + '</label>';
      html += '<textarea class="postmortem-textarea" data-field-id="' + fieldId + '" placeholder="' + (f.placeholder || '') + '" rows="3"></textarea>';
      html += '</div>';
    });
    html += '<div id="postmortem-rubric-feedback"></div>';
    html += '</div>';
    return html;
  },

  calculateScore: function() {
    var optLen = this.data.optimalPath ? this.data.optimalPath.length : 5;
    var extra = Math.max(0, this.stepsVisited.length - optLen) + this.deadEndsHit;
    var thresholds = this.data.scoring && this.data.scoring.gradeThresholds;

    if (!thresholds) {
      thresholds = {
        S: { maxExtraSteps: 0, maxHints: 0, label: 'Expert' },
        A: { maxExtraSteps: 2, maxHints: 1, label: 'Proficient' },
        B: { maxExtraSteps: 4, maxHints: 2, label: 'Developing' },
        C: { maxExtraSteps: Infinity, maxHints: Infinity, label: 'Learning' }
      };
    }

    var grade = 'C';
    var label = thresholds.C ? thresholds.C.label : 'Learning';
    var grades = ['S', 'A', 'B', 'C'];
    for (var i = 0; i < grades.length; i++) {
      var g = grades[i];
      var t = thresholds[g];
      if (t && extra <= t.maxExtraSteps && this.hintsUsed <= t.maxHints) {
        grade = g;
        label = t.label || g;
        break;
      }
    }

    return { grade: grade, label: label, steps: this.stepsVisited.length, optimalSteps: optLen };
  },

  updateSidebar: function() {
    var timeline = document.getElementById('investigation-timeline');
    if (!timeline) return;

    var html = '<div class="space-y-1">';
    var self = this;
    this.stepsVisited.forEach(function(sid, i) {
      var s = self.data.steps[sid];
      if (!s) return;
      var isCurrent = sid === self.currentStepId;
      var isDeadEnd = s.isDeadEnd;
      var stateClass = isCurrent ? 'current' : (isDeadEnd ? 'deadend' : 'completed');

      html += '<div class="investigation-step ' + stateClass + '">';
      html += '<div class="investigation-step-dot">';
      if (!isCurrent && !isDeadEnd) html += '<span class="text-white text-xs">&#10003;</span>';
      if (isDeadEnd) html += '<span class="text-red-400 text-xs">&#10007;</span>';
      html += '</div>';
      html += '<div class="flex-1 min-w-0">';
      html += '<span class="text-xs ' + (isCurrent ? 'text-amber-400 font-semibold' : isDeadEnd ? 'text-red-400/60' : 'text-gray-400') + '">' + (s.title || 'Step ' + (i + 1)) + '</span>';
      html += '</div></div>';
    });
    html += '</div>';
    timeline.innerHTML = html;

    var pct = document.getElementById('progress-percent');
    var bar = document.getElementById('progress-bar');
    var optLen = this.data.optimalPath ? this.data.optimalPath.length : 5;
    var progress = Math.min(100, Math.round((this.stepsVisited.length / (optLen + 1)) * 100));
    if (pct) pct.textContent = progress + '%';
    if (bar) bar.style.width = progress + '%';
  }
};
