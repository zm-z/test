var dbCongif = require('../util/dbconfig')


//获取数据
getMenuList = async(req, res) => {
    const sql = `select * from menu`;
    var data = await dbCongif.SySqlConnect(sql)
    res.send(data)
}

adduser = async(req, res) => {
    let sql = `INSERT INTO menu SET ?`
    let sqlArr = [req.body]
    var data = await dbCongif.SySqlConnect(sql, sqlArr)
    res.send(data)
}


updated = async(req, res) => {
    let { id, newlist } = req.body
    sqlArr = [newlist.username, newlist.email, newlist.mobile, newlist.role_name, newlist.state, id]
    console.log(sqlArr);
    console.log(1111);
    let sql = `UPDATE menu SET username=?,email=?,mobile=?,role_name=?,state=? where id=? `
    var data = await dbCongif.SySqlConnect(sql, sqlArr)
    res.send(data)
}

deluser = async(req, res) => {
    let sql = `DELETE FROM menu WHERE id=?`
    let sqlArr = [req.body.id]
    var data = await dbCongif.SySqlConnect(sql, sqlArr)
    res.send(data)
}

look = async(req, res) => {
    let sql = `select * from menu where id=?`
    let sqlArr = [req.body.id]
    var data = await dbCongif.SySqlConnect(sql, sqlArr)
    res.send(data)
}


module.exports = {
    getMenuList,
    look,
    deluser,
    updated,
    adduser
}