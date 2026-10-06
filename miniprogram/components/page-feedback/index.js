Component({
  properties: { loading: Boolean, error: String },
  methods: { onRetry() { this.triggerEvent('retry') } },
})
