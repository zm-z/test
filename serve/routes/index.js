var express = require('express');
var router = express.Router();
var cate = require('../controllets/controllets')
router.post('/getMenuList', cate.getMenuList);
router.post('/look', cate.look);
router.post('/deluser', cate.deluser);
router.post('/updated', cate.updated);
router.post('/adduser', cate.adduser);
module.exports = router;