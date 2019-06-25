module.exports = app => {
  app.log('Yay, the app was loaded!')

  app.on('pull_request.opened', async context => {
    const params = context.issue({assignees: [context.payload.pull_request.user.login]})
    return context.github.issues.addAssignees(params)
  })
}
