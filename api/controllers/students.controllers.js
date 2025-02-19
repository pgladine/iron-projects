const Student = require("../models/student.model");
const createError = require("http-errors");
const mailer = require("../config/mailer.config");
const jwt = require("jsonwebtoken");

const studentConfirmationRequired = process.env.USER_CONFIRMATION_REQUIRED === "true";
const maxSessionTime = parseInt(process.env.MAX_SESSION_TIME) || 3_600;

module.exports.list = (req, res, next) => {
  Student.find() // TODO: filters
    .populate("projects")
    .then((students) => res.json(students))
    .catch(next);
};

module.exports.create = (req, res, next) => {
  const { location } = req.body;
  req.body.address = location?.address;
  req.body.location = {
    type: 'Point',
    coordinates: location?.coordinates?.reverse(),
  }

  Student.create(req.body)
    .then((student) => {
      if (studentConfirmationRequired) {
        mailer.sendConfirmationEmail(student);
      }
      res.status(201).json(student);
    })
    .catch(next);
};

module.exports.detail = (req, res, next) => res.json(req.student);

module.exports.delete = (req, res, next) => {
  if (req.user.id !== req.params.id) {
    return next(createError(403, "Forbidden"));
  }

  Student.deleteOne({ _id: req.user.id })
    .then(() => res.status(204).send())
    .catch(next);
};

module.exports.update = (req, res, next) => {
  if (req.user.id !== req.params.id) {
    return next(createError(403, "Forbidden"));
  }

  Object.assign(req.user, req.body);

  req.user
    .save()
    .then((student) => res.json(student))
    .catch(next);
};

module.exports.confirm = (req, res, next) => {
  req.student.confirm = true;

  req.student
    .save()
    .then(() => res.redirect(`${process.env.WEB_URL}/login`))
    .catch(next);
};

module.exports.login = (req, res, next) => {
  Student.findOne({ username: req.body.username })
    .then((student) => {
      if (!student) {
        return next(createError(401, { errors: { password: 'Invalid credentials' }}));
      }

      if (!student.confirm) {
        return next(createError(401, { errors: { username: 'Please confirm your account' } }));
      }

      student.checkPassword(req.body.password).then((match) => {
        if (!match) {
          return next(createError(401, { errors: { password: 'Invalid credentials' } }));
        }

        // module 2: req.session.id = student.id;

        const token = jwt.sign(
          { sub: student.id, exp: Date.now() / 1000 + 3_600 }, // 1h duration
          process.env.JWT_SECRET
        );

        res.json({ token, ...student.toJSON() });
      });
    })
    .catch(next);
};
