在桌面建立一个新的文件夹，将文件都下载到该文件夹内，打开cmd，进入该文件夹，设置参数后运行命令即可。

## 运行规则

使用脚本前确保账户里有WBTC，本脚本会走WBTC/CBD交易对。同时需要留一些BTC当作GAS
脚本会先用你输入的amount_in金额的WBTC购买CBD，再将购买到的CBD全部卖出，再进行购买，循环直到达到你所设置的交易次数。

## 参数设置

打开swap-cbd.js，替换下面三个参数：
```
替换：private_key -> 你的钱包私钥，可以用一个专门的新交易钱包
替换：amount_in -> 每次买入的WBTC金额
替换：swaptime -> 交易次数，比如10，就是买入5次，卖出5次
```

## 开始运行
swap tool for cbd

如果你没有安装过Nodejs，访问：https://nodejs.org/en 进行安装，建议安装到本文件夹
安装成功后即可运行 npm 命令

```
先运行
npm install

再运行
node swap-cbd.js
```

如果有报错，可以先运行下面这个命令
npm install ethers @macarom/swap-sdk @macarom/stable-swap-sdk
再运行
node swap-cbd.js

