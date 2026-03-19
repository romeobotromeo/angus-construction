const express = require('express');
const router = express.Router();

function requireOwner(req, res, next) {
  if (req.session.role === 'owner') return next();
  res.redirect('/login');
}

router.get('/', requireOwner, (req, res) => {
  res.sendFile('owner.html', { root: './public' });
});

module.exports = router;
module.exports.requireOwner = requireOwner;
