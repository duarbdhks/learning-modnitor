const ProgressTracker = {
  STORAGE_KEY: 'metrics-learning-progress',
  MASTERY_KEY: 'metrics-learning-mastery-status',
  QUIZ_PREFIX: 'metrics-learning-quiz-',
  SCENARIO_PREFIX: 'metrics-learning-scenario-',
  POSTMORTEM_PREFIX: 'scenario-postmortem-',
  TOTAL_MODULES: 26,
  THEORY_MAX_INDEX: 6,
  lastReevaluationWarnings: [],

  getTotalModules() {
    var total = Number(this.TOTAL_MODULES);
    if (!Number.isFinite(total) || total <= 0) return 26;
    return Math.floor(total);
  },

  parseModuleIndex(moduleId) {
    var m = String(moduleId || '').match(/^module(\d+)$/);
    return m ? parseInt(m[1], 10) : -1;
  },

  getModuleType(moduleId) {
    var idx = this.parseModuleIndex(moduleId);
    if (idx < 0) return 'unknown';
    if (idx <= this.THEORY_MAX_INDEX) return 'theory';
    if (idx >= 19 && idx <= 21) return 'theory';
    return 'lab';
  },

  getMasteryMap() {
    try {
      var data = JSON.parse(localStorage.getItem(this.MASTERY_KEY) || '{}');
      return data && typeof data === 'object' ? data : {};
    } catch (e) {
      return {};
    }
  },

  setMasteryStatus(moduleId, status) {
    var valid = status === 'passed' ? 'passed' : 'locked';
    var data = this.getMasteryMap();
    data[moduleId] = valid;
    localStorage.setItem(this.MASTERY_KEY, JSON.stringify(data));
    return valid;
  },

  getMasteryStatus(moduleId) {
    var data = this.getMasteryMap();
    return data[moduleId] === 'passed' ? 'passed' : 'locked';
  },

  refreshMasteryStatus(moduleId) {
    var gate = this.canComplete(moduleId);
    return this.setMasteryStatus(moduleId, gate.masteryStatus);
  },

  getProgress() {
    var data;
    try {
      data = JSON.parse(localStorage.getItem(this.STORAGE_KEY) || '{}');
    } catch (e) {
      data = {};
    }

    var result = {};
    var migrated = false;
    var reevaluationWarnings = [];

    for (var i = 0; i < this.getTotalModules(); i++) {
      var moduleId = 'module' + i;
      var gate = this.canComplete(moduleId);

      this.setMasteryStatus(moduleId, gate.masteryStatus);
      result[moduleId] = gate.success;

      if (gate.success) {
        if (data[moduleId] !== true) {
          data[moduleId] = true;
          migrated = true;
        }
      } else if (data[moduleId] === true) {
        // 기존 완료 이력은 최신 기준으로 다시 반영
        delete data[moduleId];
        migrated = true;
        reevaluationWarnings.push({
          moduleId: moduleId,
          reasonCode: gate.reasonCode || 'REQUIREMENTS_CHANGED'
        });
      }
    }

    this.lastReevaluationWarnings = reevaluationWarnings;

    if (migrated) {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(data));
    }

    return result;
  },

  takeReevaluationWarnings() {
    var warnings = Array.isArray(this.lastReevaluationWarnings) ? this.lastReevaluationWarnings.slice() : [];
    this.lastReevaluationWarnings = [];
    return warnings;
  },

  canComplete(moduleId) {
    var moduleType = this.getModuleType(moduleId);
    var requirement;

    if (moduleType === 'theory') {
      var quiz = this.getQuizScore(moduleId);
      var score = quiz && typeof quiz.score === 'number' ? quiz.score : null;
      var total = quiz && typeof quiz.total === 'number' ? quiz.total : null;
      var percentage = null;

      if (typeof score === 'number' && typeof total === 'number' && total > 0) {
        percentage = Math.round((score / total) * 100);
      }

      requirement = {
        type: 'quiz',
        moduleType: 'theory',
        score: score,
        total: total,
        percentage: percentage
      };

      if (typeof score !== 'number' || typeof total !== 'number' || total <= 0) {
        return {
          success: false,
          reasonCode: 'QUIZ_NOT_COMPLETED',
          message: '이론 모듈은 퀴즈를 제출해야 완료할 수 있습니다. 먼저 퀴즈를 제출해 점수를 반영해 주세요.',
          requirement: requirement,
          masteryStatus: 'locked'
        };
      }

      return {
        success: true,
        reasonCode: 'QUIZ_PASSED',
        message: '퀴즈 제출 확인으로 완료 처리할 수 있습니다.',
        requirement: requirement,
        masteryStatus: 'passed'
      };
    }

    if (moduleType === 'lab') {
      var scenario = this.getScenarioScore(moduleId);
      var grade = scenario && scenario.grade ? String(scenario.grade).toUpperCase() : null;

      requirement = {
        type: 'scenario',
        moduleType: 'lab',
        grade: grade
      };

      if (!grade) {
        return {
          success: false,
          reasonCode: 'SCENARIO_NOT_COMPLETED',
          message: '실습 시나리오를 끝까지 진행하고 등급이 저장되어야 완료할 수 있습니다.',
          requirement: requirement,
          masteryStatus: 'locked'
        };
      }

      return {
        success: true,
        reasonCode: 'SCENARIO_GRADE_OK',
        message: '실습 등급 ' + grade + '로 완료 조건 충족.',
        requirement: requirement,
        masteryStatus: 'passed'
      };
    }

    return {
      success: false,
      reasonCode: 'UNKNOWN_MODULE_TYPE',
      message: '모듈 유형을 확인할 수 없어 완료 조건을 확인하지 못했습니다.',
      requirement: { type: 'unknown', moduleType: 'unknown' },
      masteryStatus: 'locked'
    };
  },

  markComplete(moduleId) {
    try {
      var existing;
      try {
        existing = JSON.parse(localStorage.getItem(this.STORAGE_KEY) || '{}') || {};
      } catch (e) {
        existing = {};
      }

      var alreadyCompleted = existing[moduleId] === true;
      var gate = this.canComplete(moduleId);
      this.setMasteryStatus(moduleId, gate.masteryStatus);

      if (!gate.success) {
        if (alreadyCompleted && existing[moduleId] === true) {
          delete existing[moduleId];
          localStorage.setItem(this.STORAGE_KEY, JSON.stringify(existing));

          return {
            success: false,
            reasonCode: gate.reasonCode,
            message: '기존 완료 데이터가 기존 기준과 다르게 평가되어 새 기준으로 재평가되었습니다. ' + gate.message + ' 이전 점수/등급 기준으로 완료된 항목은 조건 충족시만 유효합니다.',
            requirement: gate.requirement,
            masteryStatus: 'locked'
          };
        }

        return {
          success: false,
          reasonCode: gate.reasonCode,
          message: gate.message,
          requirement: gate.requirement,
          masteryStatus: 'locked'
        };
      }

      existing[moduleId] = true;
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(existing));

      return {
        success: true,
        reasonCode: gate.reasonCode,
        message: gate.message,
        requirement: gate.requirement,
        masteryStatus: 'passed'
      };
    } catch (e) {
      return {
        success: false,
        reasonCode: 'COMPLETE_ERROR',
        message: '진도 완료 처리 중 오류가 발생했습니다.',
        requirement: null,
        masteryStatus: 'locked'
      };
    }
  },

  isComplete(moduleId) {
    const progress = this.getProgress();
    return progress[moduleId] === true;
  },

  getQuizScore(moduleId) {
    try {
      const data = localStorage.getItem(this.QUIZ_PREFIX + moduleId);
      return data ? JSON.parse(data) : null;
    } catch (e) {
      return null;
    }
  },

  saveQuizScore(moduleId, score, total, evaluation) {
    var payload;
    if (score && typeof score === 'object') {
      payload = Object.assign({}, score);
    } else {
      payload = { score: score, total: total };
      if (evaluation && typeof evaluation === 'object') {
        payload.evaluation = evaluation;
      }
    }
    localStorage.setItem(this.QUIZ_PREFIX + moduleId, JSON.stringify(payload));
    this.refreshMasteryStatus(moduleId);
  },

  getScenarioScore(moduleId) {
    try {
      const data = localStorage.getItem(this.SCENARIO_PREFIX + moduleId);
      return data ? JSON.parse(data) : null;
    } catch (e) {
      return null;
    }
  },

  saveScenarioScore(moduleId, scoreData) {
    var existing = this.getScenarioScore(moduleId);
    var payload = Object.assign({}, existing || {}, scoreData || {});
    localStorage.setItem(this.SCENARIO_PREFIX + moduleId, JSON.stringify(payload));
    this.refreshMasteryStatus(moduleId);
  },

  getOverallProgress() {
    const progress = this.getProgress();
    const completed = Object.values(progress).filter(v => v).length;
    return Math.round((completed / this.getTotalModules()) * 100);
  },

  reset() {
    localStorage.removeItem(this.STORAGE_KEY);
    localStorage.removeItem(this.MASTERY_KEY);
    for (let i = 0; i < this.getTotalModules(); i++) {
      localStorage.removeItem(this.QUIZ_PREFIX + 'module' + i);
      localStorage.removeItem(this.SCENARIO_PREFIX + 'module' + i);
      localStorage.removeItem(this.POSTMORTEM_PREFIX + 'module' + i);
      try { sessionStorage.removeItem('scenario-session-module' + i); } catch(e) {}
      try { sessionStorage.removeItem(this.POSTMORTEM_PREFIX + 'module' + i); } catch(e) {}
    }
  }
};

// Sidebar backdrop click-to-close
document.addEventListener('click', function(e) {
  var sidebar = document.getElementById('sidebar');
  if (sidebar && sidebar.classList.contains('open') && e.target === sidebar) {
    sidebar.classList.remove('open');
  }
});
