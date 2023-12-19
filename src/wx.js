// 用户打开app的时候调用这个接口
const login = () => {
  new Promise((resolve, reject) => {
    wx.login({
      success: ({code}) => {
        if(code) {
          // 使用code请求我们自己写的后端服务器，我们自己写的后端服务器会再去请求微信的api，获得session_key，openid
          /**
           * ❕❕❕❕❕临时登录凭证 code 只能使用一次，code的有效期为五分钟，五分钟之内没用换取openid、unionid、session_key 等信息，这个code就失效果了
           * ❕❕❕❕❕openid、unionid、session_key 等信息是长效信息
           */
          wx.request({
            method: 'POST',
            url: 'http://localhost:9012/login/',
            data: {
              code
            },
            success: ({data: {data: {session}}}) => {
              wx.setStorageSync('session', session)
              resolve(session)
            }
          })
        }else {
          console.log('登陆失败');
          reject('登陆失败')
        }
      }
    })
  })
}

// 用户点击微信登陆按钮
const getPhoneNumber = async ({detail: {encrytedData, iv}}) => {
  // encrytedData, iv这两个参数要给到后端，让后端去处理
  // 如果用户拒绝登陆，encrytedData与iv的值为undefined
  // encrytedData, iv使用base64编码过了 

  // 获取token
  const session = wx.getStorageSycn('session')
  if(!session) {
    try {
      session = await login()
    }catch(e) {
      console.log(e)
      return
    }
  }

  // 请求后端接口把token给到后端，后端会
  wx.request({
    methods: 'POST',
    url: "http://localhost:9012/getPhoneNumber/",
    data: {
      encrytedData,
      iv,
      token
    },
    success: ({data: {data}}) => {
      console.log(data);
    }
  })
}
