const ProgressTracker = {
  STORAGE_KEY: 'metrics-learning-progress',
  QUIZ_PREFIX: 'metrics-learning-quiz-',
  TOTAL_MODULES: 7,

  getProgress() {
    const data = JSON.parse(localStorage.getItem(this.STORAGE_KEY) || '{}');
    const result = {};
    for (let i = 0; i <= 6; i++) {
      result['module' + i] = data['module' + i] === true;
    }
    return result;
  },

  markComplete(moduleId) {
    const data = JSON.parse(localStorage.getItem(this.STORAGE_KEY) || '{}');
    data[moduleId] = true;
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(data));
  },

  isComplete(moduleId) {
    const progress = this.getProgress();
    return progress[moduleId] === true;
  },

  getQuizScore(moduleId) {
    const data = localStorage.getItem(this.QUIZ_PREFIX + moduleId);
    return data ? JSON.parse(data) : null;
  },

  saveQuizScore(moduleId, score, total) {
    localStorage.setItem(this.QUIZ_PREFIX + moduleId, JSON.stringify({ score, total }));
  },

  getOverallProgress() {
    const progress = this.getProgress();
    const completed = Object.values(progress).filter(v => v).length;
    return Math.round((completed / this.TOTAL_MODULES) * 100);
  },

  reset() {
    localStorage.removeItem(this.STORAGE_KEY);
    for (let i = 0; i <= 6; i++) {
      localStorage.removeItem(this.QUIZ_PREFIX + 'module' + i);
    }
  }
};
