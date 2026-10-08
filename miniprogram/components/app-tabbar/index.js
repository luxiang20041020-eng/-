const { redirectTo } = require('../../utils/interaction')

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
      const iconMap = {
        home: 'HM',
        booking: 'BK',
        workspace: 'WK',
        admin: 'AD',
        profile: 'ME',
      }
      this.setData({
        tabs: app.getRuntimeSnapshot().tabItems.map((item) => Object.assign({}, item, {
          iconText: iconMap[item.key] || 'NA',
        })),
      })
    },

    onTap(event) {
      const { path } = event.currentTarget.dataset
      if (!path || path === this.data.current) {
        return
      }

      redirectTo({ url: path })
    },
  },
})
