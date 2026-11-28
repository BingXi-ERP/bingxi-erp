export const zhCN = {
  app: {
    name: '秉羲工作台',
    description: '秉羲纺织 ERP 小程序端',
    environment: '环境：',
    terminalSource: '终端来源：',
  },
  stateView: {
    loading: '加载中...',
    empty: '暂无数据',
    error: '加载失败，请重试',
    retry: '重试',
  },
  login: {
    subtitle: '登录后进入工作台',
    username: '用户名',
    password: '密码',
    usernamePlaceholder: '请输入用户名',
    passwordPlaceholder: '请输入密码',
    submit: '登录',
    wechat: '微信登录',
    failed: '登录失败，请检查账号信息后重试',
    phoneDenied: '未获得手机号授权，无法使用微信登录',
    wechatUnavailable: '微信登录暂不可用，请重试或使用账号登录',
  },
  workspace: {
    title: '工作台',
    currentUser: '当前用户',
    ordersRead: '订单管理',
    ordersCreate: '新建订单',
    sessionInvalid: '登录状态已失效，请重新登录',
    verifyFailed: '会话校验失败，请重试',
    verifyRejected: '会话校验异常，请重试',
  },
  tabBar: {
    workspace: '工作台',
  },
  userPicker: {
    title: '选择用户',
    placeholder: '请选择用户',
  },
} as const
