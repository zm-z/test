const HtmlWebpackPlugin = require("html-webpack-plugin");
const ReactRefreshWebpackPlugin = require("@pmmmwh/react-refresh-webpack-plugin");

module.exports = {
  mode: "development", //开发模式
  entry: "./src/index.jsx", //入口
  devServer: {
    hot: true, //开启热更新，这个是关键！！！
    port: 8000, //设置端口号
  },
  plugins: [
    new HtmlWebpackPlugin({
      template: "./index.html", //将打包后的代码插入到html模版中
    }),
    new ReactRefreshWebpackPlugin(),
  ],
   module: {
       rules: [
         {
           test: /\.jsx?$/i,
           exclude: /node_modules/,
           use: "babel-loader", 
         },
       ],
     },
};
