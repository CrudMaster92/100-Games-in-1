# Applet Registry

The canonical registry for the dashboard lives in `applets.json`. When updating this
file, run `node build-inline.js` from the same directory to regenerate
`applets-inline.js`. The inline bundle lets the dashboard test cabinet load the
registry when the UI is opened directly from the filesystem (the default behaviour
of `RunDashboard.bat`).
