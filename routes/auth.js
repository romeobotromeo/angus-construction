const express = require('express');
const router = express.Router();

router.get('/login', (req, res) => {
  if (req.session.role) {
    return res.redirect(req.session.role === 'owner' ? '/owner' : '/investor');
  }
  res.sendFile('login.html', { root: './public' });
});

router.post('/login', (req, res) => {
  const { password } = req.body;
  if (password === process.env.OWNER_PASS) {
    req.session.role = 'owner';
    return res.redirect('/owner');
  }
  if (password === process.env.INVESTOR_PASS) {
    req.session.role = 'investor';
    return res.redirect('/investor');
  }
  res.redirect('/login?error=1');
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/login'));
});

module.exports = router;
