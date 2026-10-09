const { redirectTo } = require('../../utils/interaction')
const { t, subscribe } = require('../../utils/i18n')

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
      this._stopLocale = subscribe(() => this.syncTabs())
    },
    detached() { if (this._stopLocale) this._stopLocale() },
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
          label: t(item.label),
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
