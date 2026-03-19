const express = require('express');
const router = express.Router();

function requireInvestor(req, res, next) {
  if (req.session.role === 'owner' || req.session.role === 'investor') return next();
  res.redirect('/login');
}

router.get('/', requireInvestor, (req, res) => {
  res.sendFile('investor.html', { root: './public' });
});

module.exports = router;
