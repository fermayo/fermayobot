const columns = {
  IN_PROGRESS: 4075617,
  PENDING_REVIEW: 4583050,
  PENDING_MERGE: 4583062,
}

const calculate_column_id = async context => {
  const params = context.issue()
  let reviews = {}
  // Update each reviewer status with the latest review
  reviews = (await context.github.pulls.listReviews(params)).data.reduce((r, f) => {r[f.user.login] = f.state.toLowerCase(); return r}, reviews)
  // Add requested reviewers as 'pending'
  reviews = context.payload.pull_request.requested_reviewers.reduce((r, f) => {r[f.login] = 'pending'; return r}, reviews)
  delete reviews[context.payload.pull_request.user.login]
  const states = Object.values(reviews)
  if(states.length === 0) {
    return columns.IN_PROGRESS
  } else if(states.every(state => state === 'approved')) {
    return columns.PENDING_MERGE
  } else if(states.some(state => state === 'request_changes')) {
    return columns.IN_PROGRESS
  } else if(states.some(state => state === 'pending') || states.some(state => state === 'commented')) {
    return columns.PENDING_REVIEW
  } else {
    return columns.IN_PROGRESS
  }
}

const find_card_for_pr = async context => {
  const issue_url = context.payload.pull_request.issue_url
  for(let column_id of [columns.IN_PROGRESS, columns.PENDING_REVIEW, columns.PENDING_MERGE]) {
    const cards = (await context.github.projects.listCards({column_id})).data
    const card = cards.find(i => i.content_url === issue_url)
    if(card) {
      return {card, column_id}
    }
  }
  // TODO: check pending cards
}

module.exports = app => {
  app.log('Yay, the app was loaded!')

  app.on('pull_request.opened', async context => {
    const promises = []
    const params = context.issue({assignees: [context.payload.pull_request.user.login]})
    promises.push(context.github.projects.createCard({
      column_id: columns.IN_PROGRESS,
      content_id: context.payload.pull_request.id,
      content_type: 'PullRequest',
    }))
    promises.push(context.github.issues.addAssignees(params))
    return Promise.all(promises)
  })

  app.on(['pull_request.review_requested', 'pull_request.review_request_removed', 'pull_request_review'], async context => {
    const promises = []
    const [card, target_column_id] = await Promise.all([find_card_for_pr(context), calculate_column_id(context)])
    if(card) {
      if (card.column_id !== target_column_id) {
        promises.push(context.github.projects.moveCard({
          card_id: card.card.id,
          position: 'top',
          column_id: target_column_id,
        }))
      }
    }
    return Promise.all(promises)
  })
}
