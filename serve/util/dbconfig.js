const mysql = require('mysql')
module.exports = {
    //配置数据库
    config: {
        host: 'localhost',
        port: '3306', //端口
        user: 'root',
        password: '19981230',
        database: 'login'
    },
    //连接数据库，使用连接池
    //连接池对象
    //promise封装
    SySqlConnect: function(sySql, sqlArr) {
        return new Promise((resolve, reject) => {
            var pool = mysql.createPool(this.config)
            pool.getConnection((err, conn) => {
                if (err) {
                    reject(err)
                } else {
                    //事件驱动回调
                    conn.query(sySql, sqlArr, (err, data) => {
                        if (err) {
                            reject(err)
                        } else {
                            resolve(data)
                        }
                    });
                    //释放连接
                    conn.release();
                }
            })
        }).catch((err) => {
            console.log(err);
        })
    }

}