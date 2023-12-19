# wx-login-backend
node实现微信小程序的后端开发流程

⚠️⚠️注意⚠️⚠️
⚠️会话密钥 session_key 是对用户数据进行 加密签名 的密钥。为了应用自身的数据安全，开发者服务器不应该把会话密钥下发到小程序，也不应该对外提供这个密钥。
⚠️临时登录凭证 code 只能使用一次，code的有效期为五分钟，五分钟之内没用换取openid、unionid、session_key 等信息，这个code就失效果了
⚠️openid、unionid、session_key 等信息是长效信息

1. 在微信小程序app.js文件的，onLaunch中调用wx.login，把获取到的code传给后端，代码如下
```js
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
App({
  onLaunch() {
    login()
  }
})
```
2. 后端接收到code，调用微信api获得，获得session_key和openid，然后后端把session_key和openid返回给前端(这里做的简单了，应该是在后端利用session_key和openid去关联一个session，把session放入到存储服务redis或者mysql中，然后把这个session返回给前端，以后前端只需要发送这个session到后端，后端就可以使用redis.get获取到session_key和openid了)
```js
async (ctx) => {
  /**
   * ❕❕❕❕❕临时登录凭证 code 只能使用一次，code的有效期为五分钟，五分钟之内没用换取openid、unionid、session_key 等信息，这个code就失效果了
   * ❕❕❕❕❕openid、unionid、session_key 等信息是长效信息
   */
  // 获取前端传来的code
  const { code } = ctx.request.body;
  // 使用code，请求微信api获取openid和session_key
  // 需要用到appid，secret（在和获取appid相同的位置获得），secret是小程序密钥，需要小程序通过公众号验证之后才能获取，个人小程序是没有这个密钥的
  const { data } = await axios.get(wx_url, {
    params: {
      appid,
      secret,
      js_code: code,
      grant_type: "authorization_code", // 微信规定要求使用这个类型来请求wx_url('https://api.weixin.qq.com/sns/jscode2session')的时候, 微信服务器才认为这是获取session_key和openid的请求
    },
  });

  // 返回的data中会包含两个值，一个是openid，另一个就是session_key，session_key是一个钥匙，通过这个钥匙配合小程序的提供的库，可以做很多小程序的解密工作
  // 如果不需要关联到自己的存储服务的话，openid就可以唯一标识一个用户了，不需要session_key
  // const { session_key, openid } = data;

  /**
   * ❕❕❕❕❕会话密钥 session_key 是对用户数据进行 加密签名 的密钥。为了应用自身的数据安全，开发者服务器不应该把会话密钥下发到小程序，也不应该对外提供这个密钥。
   * ❕❕❕❕❕临时登录凭证 code 只能使用一次，code的有效期为五分钟，五分钟之内没用换取openid、unionid、session_key 等信息，这个code就失效果了
   * ❕❕❕❕❕openid、unionid、session_key 等信息是长效信息
   */

  // 这里为了省事，所以把session_key和openid返回给客户端
  const session = JSON.stringify(data)
  ctx.body = {
    data: {
      session,
    },
  };
}
```
3. 前端把后端返回的session存储起来
```js
wx.setStorageSync('session', session)
```
4. 前端在用户点击微信登陆的按钮的时候，向后端发起请求进行登陆
```html
<button open-type="getPhoneNumber" bindgetphonenumber="getPhoneNumber">微信登录</button>
```
```js
// 用户点击微信登陆按钮
const getPhoneNumber = async ({detail: {encrytedData, iv}}) => {
  // encrytedData, iv这两个参数是在用户点击"微信登陆"这个按钮的时候传入到handleGetPhoneNumber这个回调函数中的
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
```
5. 后端接收到请求就要处理这个请求，后端使用微信提供的库，对前端传来的参数进行解密，获得到手机号
获得到手机号之后，要判断这个手机号有没有注册过
* 如果注册过
  就直接走后端的登陆流程，注意这个登陆流程不需要密码和验证码，因为微信小程序提供这个微信登录就是为了让用户不输入密码，我们既然信任了微信，要使用微信登登录，那我们就没必要去验证密码
  当然上面说的不进行密码和验证码的校验也是推荐，如果非要校验也不是不可以，但这样微信登录也就失去了意义
* 如果没有注册过
  那就应该响应给前端，该用户没有注册，让前端可以跳转到注册页面，在这个注册页面上还可以使用微信头像，微信昵称，但是不能获得用户的手机号，所以这里有一个建议，可以在用户没有注册的时候，把用户的手机号返回给前端，让前端把用户的手机号显示在注册页面中，省去用户输入的步骤
```js
async (ctx) => {
  const { encryptedData, iv, session } = ctx.request.body;
  // 从token中解析出session_key, openid
  const {session_key, openid} = JSON.parse(session);


  // 使用微信提供的包进行解密操作，获取用户的手机号
  var pc = new WXBizDataCrypt(appid, session_key)
  var data = pc.decryptData(encryptedData , iv)
  // data样板如下
  /**
   * {
   *     "phoneNumber": "13580006666",
   *     "purePhoneNumber": "13580006666",
   *     "countryCode": "86",
   *     "watermark":
   *     {
   *         "appid":"APPID",
   *         "timestamp": TIMESTAMP
   *     }
   * }
   */


  const {phoneNumber, countryCode} = data

  if(phoneNumber) {
    // 如果data中能解析出手机号
    // 去存储服务中查找这个手机号注册过没有？
    // 如果没有
    ctx.body = {
      data: {
        code: 404,
        msg: "没有注册",
        phoneNumber
      }
    }
    // 如果注册了，就要进入下一个中间件————我们后端的登陆的中间件，给前端返回一个我们自己服务器使用jwt生成的token，而不是小程序之前提供的session
    await next()
  }
}
```
