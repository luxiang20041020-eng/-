Component({
  properties: {
    current: {
      type: String,
      value: '',
    },
  },

  data: {
    tabs: [],
  },

  lifetimes: {
    attached() {
      this.syncTabs()
    },
  },

  pageLifetimes: {
    show() {
      this.syncTabs()
    },
  },

  methods: {
    syncTabs() {
      const app = getApp()
      this.setData({
        tabs: app.getRuntimeSnapshot().tabItems,
      })
    },

    onTap(event) {
      const { path } = event.currentTarget.dataset
      if (!path || path === this.data.current) {
        return
      }

      wx.redirectTo({ url: path })
    },
  },
})
