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
          correct = userAnswer.toLowerCase() === String(q.answer).toLowerCase().trim();
        }
      }

      if (correct) score++;

      results.push({
        correct,
        userAnswer,
        correctAnswer: q.type === 'choice' ? q.options[q.answer] : q.answer,
        explanation: q.explanation
      });
    });

    this.showResults(results, score, total);

    if (this.currentModuleId) {
      ProgressTracker.saveQuizScore(this.currentModuleId, score, total);
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

    const submitBtn = container.querySelector('#quiz-submit-btn');
    if (submitBtn) {
      submitBtn.textContent = '다시 풀기';
      submitBtn.onclick = () => {
        QuizEngine.init(this.containerId, this.questions, this.currentModuleId);
      };
    }

    results.forEach((result, idx) => {
      const questionEl = container.querySelector('.quiz-question[data-index="' + idx + '"]');
      const feedbackEl = container.querySelector('[data-feedback="' + idx + '"]');

      if (questionEl) {
        questionEl.classList.add(result.correct ? 'quiz-correct' : 'quiz-wrong');

        if (this.questions[idx].type === 'choice') {
          questionEl.querySelectorAll('.quiz-option').forEach(opt => {
            opt.style.pointerEvents = 'none';
          });
        } else {
          const input = questionEl.querySelector('.quiz-text-input');
          if (input) input.disabled = true;
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
    }
  }
};
