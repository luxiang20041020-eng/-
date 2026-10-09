Component({
  properties: { loading: Boolean, error: String, language: { type: String, value: 'zh' } },
  methods: { onRetry() { this.triggerEvent('retry') } },
})
