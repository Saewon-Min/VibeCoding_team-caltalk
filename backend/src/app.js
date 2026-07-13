const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const { errorHandler, notFoundHandler } = require('./middleware/error-handler');

const app = express();

app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

app.use('/api/auth', require('./modules/auth/auth.routes'));
app.use('/api/teams', require('./modules/team-schedule/team.routes'));
app.use('/api/teams', require('./modules/team-schedule/schedule.routes'));

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
