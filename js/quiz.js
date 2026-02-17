const QuizEngine = {
  currentModuleId: null,
  questions: [],
  containerId: null,

  init(containerId, questions, moduleId) {
    this.containerId = containerId;
    this.questions = questions;
    this.currentModuleId = moduleId;
    const container = document.getElementById(containerId);
    if (!container) return;

    let html = '<div class="quiz-wrapper">';
    html += '<h3 class="text-2xl font-bold text-white mb-6">Quiz</h3>';

    questions.forEach((q, idx) => {
      html += '<div class="quiz-question" data-index="' + idx + '">';
      html += '<div class="quiz-question-header">';
      html += '<span class="quiz-question-number">Q' + (idx + 1) + '</span>';
      html += '<p class="quiz-question-text">' + q.question + '</p>';
      html += '</div>';

      if (q.type === 'choice') {
        html += '<div class="quiz-options">';
        q.options.forEach((opt, optIdx) => {
          html += '<label class="quiz-option" data-question="' + idx + '" data-option="' + optIdx + '">';
          html += '<input type="radio" name="quiz-q-' + idx + '" value="' + optIdx + '" class="hidden">';
          html += '<span class="quiz-option-indicator"></span>';
          html += '<span class="quiz-option-text">' + opt + '</span>';
          html += '</label>';
        });
        html += '</div>';
      } else if (q.type === 'short') {
        html += '<div class="quiz-short-answer">';
        html += '<input type="text" class="quiz-text-input" data-question="' + idx + '" placeholder="답을 입력하세요..." autocomplete="off">';
        html += '</div>';
      }

      html += '<div class="quiz-feedback hidden" data-feedback="' + idx + '"></div>';
      html += '</div>';
    });

    html += '<div class="quiz-actions">';
    html += '<button id="quiz-submit-btn" class="quiz-submit-btn" onclick="QuizEngine.submit()">제출하기</button>';
    html += '</div>';
    html += '<div id="quiz-results-summary" class="quiz-results-summary hidden"></div>';
    html += '</div>';

    container.innerHTML = html;

    container.querySelectorAll('.quiz-option').forEach(option => {
      option.addEventListener('click', function () {
        const questionIdx = this.dataset.question;
        const parent = this.closest('.quiz-options');
        parent.querySelectorAll('.quiz-option').forEach(o => o.classList.remove('selected'));
        this.classList.add('selected');
        this.querySelector('input[type="radio"]').checked = true;
      });
    });

    container.querySelectorAll('.quiz-text-input').forEach(input => {
      input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          QuizEngine.submit();
        }
      });
    });

    if (typeof Prism !== 'undefined') {
      Prism.highlightAllUnder(container);
    }

    if (typeof ProgressTracker !== 'undefined' && moduleId) {
      const saved = ProgressTracker.getQuizScore(moduleId);
      if (saved && saved.evaluation && saved.evaluation.perQuestion) {
        saved.evaluation.perQuestion.forEach(pq => {
          if (pq.type === 'choice' && pq.userAnswer !== null && pq.userAnswer !== undefined) {
            const radio = container.querySelector('input[name="quiz-q-' + pq.index + '"][value="' + pq.userAnswer + '"]');
            if (radio) {
              radio.checked = true;
              const label = radio.closest('.quiz-option');
              if (label) label.classList.add('selected');
            }
          } else if (pq.type === 'short' && pq.userAnswer) {
            const input = container.querySelector('.quiz-text-input[data-question="' + pq.index + '"]');
            if (input) input.value = pq.userAnswer;
          }
        });
        this.submit();
      }
    }
  },

  toArray(value) {
    if (Array.isArray(value)) return value;
    if (value === undefined || value === null) return [];
    return [value];
  },

  normalizeText(value, caseSensitive) {
    const text = String(value === undefined || value === null ? '' : value).trim().replace(/\s+/g, ' ');
    return caseSensitive ? text : text.toLowerCase();
  },

  getShortAnswerEvaluator(question) {
    if (question && question.evaluator && typeof question.evaluator === 'object') {
      return question.evaluator;
    }
    if (question && question.shortAnswerEvaluator && typeof question.shortAnswerEvaluator === 'object') {
      return question.shortAnswerEvaluator;
    }
    return {
      mode: 'exact',
      expected: question ? question.answer : ''
    };
  },

  evaluateExactShortAnswer(userAnswer, evaluator, question) {
    const expectedValues = this.toArray(evaluator.expected !== undefined ? evaluator.expected : question.answer);
    const normalizedUser = this.normalizeText(userAnswer, evaluator.caseSensitive);
    const normalizedExpected = expectedValues.map(v => this.normalizeText(v, evaluator.caseSensitive));
    const matchedIndex = normalizedExpected.indexOf(normalizedUser);
    const matched = matchedIndex !== -1;

    return {
      correct: matched,
      score: matched ? 1 : 0,
      detail: {
        mode: 'exact',
        matchedValue: matched ? expectedValues[matchedIndex] : null
      },
      correctAnswer: evaluator.answerText || expectedValues.join(' / ')
    };
  },

  evaluateKeywordShortAnswer(userAnswer, evaluator) {
    const keywords = this.toArray(evaluator.keywords).map(k => String(k));
    const normalizedUser = this.normalizeText(userAnswer, evaluator.caseSensitive);
    const normalizedKeywords = keywords.map(k => this.normalizeText(k, evaluator.caseSensitive));
    const matchedKeywords = keywords.filter((_, idx) => normalizedUser.indexOf(normalizedKeywords[idx]) !== -1);

    let requiredMatches = evaluator.minMatch;
    if (typeof requiredMatches !== 'number') {
      requiredMatches = evaluator.match === 'any' ? 1 : normalizedKeywords.length;
    }
    requiredMatches = Math.max(1, requiredMatches);

    const correct = normalizedKeywords.length > 0 && matchedKeywords.length >= requiredMatches;
    const ratio = normalizedKeywords.length > 0 ? matchedKeywords.length / normalizedKeywords.length : 0;

    return {
      correct,
      score: ratio,
      detail: {
        mode: 'keyword',
        matchedKeywords,
        requiredMatches,
        totalKeywords: normalizedKeywords.length
      },
      correctAnswer: evaluator.answerText || keywords.join(', ')
    };
  },

  evaluateRegexShortAnswer(userAnswer, evaluator) {
    const patterns = this.toArray(evaluator.patterns !== undefined ? evaluator.patterns : evaluator.pattern);
    const flags = evaluator.flags || 'i';
    const text = String(userAnswer === undefined || userAnswer === null ? '' : userAnswer).trim();
    const compiled = [];

    patterns.forEach(p => {
      try {
        compiled.push(new RegExp(String(p), flags));
      } catch (e) {
        // Ignore invalid regex and continue with remaining patterns.
      }
    });

    let requiredMatches = evaluator.minMatch;
    if (typeof requiredMatches !== 'number') {
      requiredMatches = evaluator.match === 'all' ? compiled.length : 1;
    }
    requiredMatches = Math.max(1, requiredMatches);

    const matchedPatterns = compiled.filter(re => re.test(text));
    const correct = compiled.length > 0 && matchedPatterns.length >= requiredMatches;
    const ratio = compiled.length > 0 ? matchedPatterns.length / compiled.length : 0;

    return {
      correct,
      score: ratio,
      detail: {
        mode: 'regex',
        matchedCount: matchedPatterns.length,
        totalPatterns: compiled.length,
        requiredMatches
      },
      correctAnswer: evaluator.answerText || patterns.join(' / ')
    };
  },

  evaluateRubricShortAnswer(userAnswer, evaluator) {
    const criteria = Array.isArray(evaluator.criteria) ? evaluator.criteria : [];
    const normalizedUser = this.normalizeText(userAnswer, evaluator.caseSensitive);
    let totalPoints = 0;
    let earnedPoints = 0;
    const criteriaResults = [];

    criteria.forEach((criterion, idx) => {
      const points = typeof criterion.points === 'number' ? criterion.points : 1;
      totalPoints += points;

      let matched = false;
      if (criterion.regex) {
        try {
          const regex = new RegExp(String(criterion.regex), criterion.flags || (evaluator.caseSensitive ? '' : 'i'));
          matched = regex.test(String(userAnswer || ''));
        } catch (e) {
          matched = false;
        }
      } else if (Array.isArray(criterion.keywords) && criterion.keywords.length > 0) {
        const normalizedKeywords = criterion.keywords.map(k => this.normalizeText(k, evaluator.caseSensitive));
        const keywordMatches = normalizedKeywords.filter(k => normalizedUser.indexOf(k) !== -1).length;
        const required = typeof criterion.minMatch === 'number'
          ? Math.max(1, criterion.minMatch)
          : (criterion.match === 'all' ? normalizedKeywords.length : 1);
        matched = keywordMatches >= required;
      } else if (criterion.contains) {
        matched = normalizedUser.indexOf(this.normalizeText(criterion.contains, evaluator.caseSensitive)) !== -1;
      } else {
        matched = normalizedUser.length > 0;
      }

      if (matched) earnedPoints += points;
      criteriaResults.push({
        id: criterion.id || ('criterion-' + idx),
        label: criterion.label || ('Criterion ' + (idx + 1)),
        matched,
        points,
        earned: matched ? points : 0
      });
    });

    if (totalPoints === 0) {
      totalPoints = 1;
      earnedPoints = normalizedUser.length > 0 ? 1 : 0;
    }

    const minScore = typeof evaluator.minScore === 'number'
      ? evaluator.minScore
      : (typeof evaluator.passScore === 'number' ? evaluator.passScore : totalPoints);
    const correct = earnedPoints >= minScore;

    return {
      correct,
      score: earnedPoints / totalPoints,
      detail: {
        mode: 'rubric',
        earnedPoints,
        totalPoints,
        minScore,
        criteria: criteriaResults
      },
      correctAnswer: evaluator.answerText || '루브릭 기준 충족 필요'
    };
  },

  evaluateShortAnswer(question, userAnswer) {
    const evaluator = this.getShortAnswerEvaluator(question);
    const mode = String(evaluator.mode || 'exact').toLowerCase();

    let evaluation;
    if (mode === 'keyword') {
      evaluation = this.evaluateKeywordShortAnswer(userAnswer, evaluator);
    } else if (mode === 'regex') {
      evaluation = this.evaluateRegexShortAnswer(userAnswer, evaluator);
    } else if (mode === 'rubric') {
      evaluation = this.evaluateRubricShortAnswer(userAnswer, evaluator);
    } else {
      evaluation = this.evaluateExactShortAnswer(userAnswer, evaluator, question);
    }

    evaluation.mode = mode;
    return evaluation;
  },

  submit() {
    const container = document.getElementById(this.containerId);
    if (!container) return;

    const results = [];
    let score = 0;
    const total = this.questions.length;

    this.questions.forEach((q, idx) => {
      let userAnswer = null;
      let correct = false;
      let evaluation = null;

      if (q.type === 'choice') {
        const selected = container.querySelector('input[name="quiz-q-' + idx + '"]:checked');
        if (selected) {
          userAnswer = parseInt(selected.value);
          correct = userAnswer === q.answer;
        }
      } else if (q.type === 'short') {
        const input = container.querySelector('.quiz-text-input[data-question="' + idx + '"]');
        if (input) {
          userAnswer = input.value.trim();
          evaluation = this.evaluateShortAnswer(q, userAnswer);
          correct = !!evaluation.correct;
        }
      }

      if (correct) score++;

      const shortAnswerLabel = evaluation && evaluation.correctAnswer
        ? evaluation.correctAnswer
        : q.answer;

      results.push({
        correct,
        userAnswer,
        correctAnswer: q.type === 'choice' ? q.options[q.answer] : shortAnswerLabel,
        explanation: q.explanation,
        evaluation
      });
    });

    this.showResults(results, score, total);

    if (this.currentModuleId) {
      const evaluationMeta = {
        evaluatedAt: new Date().toISOString(),
        percentage: total > 0 ? Math.round((score / total) * 100) : 0,
        perQuestion: results.map((result, idx) => ({
          index: idx,
          type: this.questions[idx].type,
          correct: result.correct,
          userAnswer: result.userAnswer,
          mode: result.evaluation ? result.evaluation.mode : null,
          detail: result.evaluation ? result.evaluation.detail : null
        }))
      };
      ProgressTracker.saveQuizScore(this.currentModuleId, score, total, evaluationMeta);
    }

    return { score, total, results };
  },

  showResults(results, score, total) {
    const container = document.getElementById(this.containerId);
    if (!container) return;

    const percentage = Math.round((score / total) * 100);
    const summaryEl = container.querySelector('#quiz-results-summary');
    if (summaryEl) {
      let gradeClass = 'quiz-grade-low';
      let gradeEmoji = '';
      if (percentage >= 80) {
        gradeClass = 'quiz-grade-high';
        gradeEmoji = '';
      } else if (percentage >= 60) {
        gradeClass = 'quiz-grade-mid';
        gradeEmoji = '';
      }

      summaryEl.innerHTML =
        '<div class="quiz-score-display ' + gradeClass + '">' +
        '<span class="quiz-score-number">' + score + '</span>' +
        '<span class="quiz-score-divider">/</span>' +
        '<span class="quiz-score-total">' + total + '</span>' +
        '</div>' +
        '<p class="quiz-score-text">' + total + '문항 중 ' + score + '문항 정답 (' + percentage + '%) ' + gradeEmoji + '</p>';
      summaryEl.classList.remove('hidden');
      summaryEl.classList.add('quiz-results-animate');
    }

    const hasWrong = results.some(r => r.correct === false);
    const submitBtn = container.querySelector('#quiz-submit-btn');
    if (submitBtn) {
      if (hasWrong) {
        submitBtn.textContent = '다시 제출하기';
        submitBtn.onclick = () => QuizEngine.submit();
      } else {
        submitBtn.textContent = '다시 풀기';
        submitBtn.onclick = () => {
          var moduleId = QuizEngine.currentModuleId;
          if (moduleId && typeof localStorage !== 'undefined') {
            localStorage.removeItem('metrics-learning-quiz-' + moduleId);
          }
          QuizEngine.init(this.containerId, this.questions, this.currentModuleId);
        };
      }
    }

    results.forEach((result, idx) => {
      const questionEl = container.querySelector('.quiz-question[data-index="' + idx + '"]');
      const feedbackEl = container.querySelector('[data-feedback="' + idx + '"]');

      if (questionEl) {
        questionEl.classList.remove('quiz-correct', 'quiz-wrong');
        questionEl.classList.add(result.correct ? 'quiz-correct' : 'quiz-wrong');

        if (result.correct) {
          if (this.questions[idx].type === 'choice') {
            questionEl.querySelectorAll('.quiz-option').forEach(opt => {
              opt.style.pointerEvents = 'none';
            });
          } else {
            const input = questionEl.querySelector('.quiz-text-input');
            if (input) input.disabled = true;
          }
        }
      }

      if (feedbackEl) {
        let feedbackHtml = '';
        if (result.correct) {
          feedbackHtml = '<div class="quiz-feedback-correct"><span class="quiz-check-icon">&#10003;</span> 정답입니다!</div>';
        } else {
          feedbackHtml =
            '<div class="quiz-feedback-wrong">' +
            '<span class="quiz-wrong-icon">&#10007;</span> 오답입니다.' +
            '<div class="quiz-correct-answer">정답: ' + result.correctAnswer + '</div>' +
            '</div>';
        }
        if (result.explanation) {
          feedbackHtml += '<div class="quiz-explanation"><strong>해설:</strong> ' + result.explanation + '</div>';
        }
        feedbackEl.innerHTML = feedbackHtml;
        feedbackEl.classList.remove('hidden');
        feedbackEl.classList.add('quiz-feedback-animate');
      }
    });

    if (summaryEl) {
      summaryEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

      if (typeof handleComplete === 'function') {
        const existingBtn = document.getElementById('quiz-complete-btn');
        if (existingBtn) existingBtn.remove();

        const alreadyComplete = typeof ProgressTracker !== 'undefined' && ProgressTracker.isComplete(QuizEngine.currentModuleId);
        let completeBtnHtml;
        if (alreadyComplete) {
          completeBtnHtml =
            '<div class="text-center mt-4">' +
            '<button id="quiz-complete-btn" class="px-6 py-2.5 bg-emerald-600 text-white font-semibold rounded-lg transition-all mt-4" disabled>학습 완료됨</button>' +
            '</div>';
        } else {
          completeBtnHtml =
            '<div class="text-center mt-4">' +
            '<button id="quiz-complete-btn" class="px-6 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-lg transition-all mt-4">학습 완료</button>' +
            '</div>';
        }
        summaryEl.insertAdjacentHTML('afterend', completeBtnHtml);

        // If already complete, sync page-level button too
        if (alreadyComplete && typeof markButtonComplete === 'function') {
          markButtonComplete();
        }

        if (!alreadyComplete) {
          const btn = document.getElementById('quiz-complete-btn');
          if (btn) {
            btn.addEventListener('click', function () {
              handleComplete();
              this.textContent = '학습 완료됨';
              this.disabled = true;
            });
          }
        }
      }
    }
  }
};
