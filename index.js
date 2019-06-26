const columns = {
  IN_PROGRESS: 4075617,
  PENDING_REVIEW: 4583050,
  PENDING_MERGE: 4583062,
}

const calculate_column_id = async context => {
  const params = context.issue()
  const reviews = (await context.github.pulls.listReviews(params)).data
  if(reviews.length === 0) {
    return columns.PENDING_REVIEW
  } else if(reviews.every(i => i.state === 'APPROVED')) {
    return columns.PENDING_MERGE
  } else if(reviews.some(i => i.state === 'REQUEST_CHANGES')) {
    return columns.IN_PROGRESS
  } else if(reviews.some(i => i.state === 'PENDING')) {
    return columns.PENDING_REVIEW
  } else {
    return columns.IN_PROGRESS
  }
}

const find_card_for_pr = async context => {
  const issue_url = context.payload.pull_request.issue_url
  for(let column_id of [columns.IN_PROGRESS, columns.PENDING_REVIEW, columns.PENDING_MERGE]) {
    const cards = (await context.github.projects.listCards({column_id})).data
    context.log(cards)
    const card = cards.find(i => i.content_url === issue_url)
    if(card) {
      return {card, column_id}
    }
  }
}

module.exports = app => {
  app.log('Yay, the app was loaded!')

  app.on(['pull_request.opened', 'pull_request.reopened'], async context => {
    const promises = []
    const params = context.issue({assignees: [context.payload.pull_request.user.login]})
    promises.push(context.github.projects.createCard({
      column_id: await calculate_column_id(context),
      content_id: context.payload.pull_request.id,
      content_type: 'PullRequest',
    }))
    promises.push(context.github.issues.addAssignees(params))
    return Promise.all(promises)
  })

  app.on(['pull_request.review_requested', 'pull_request_review'], async context => {
    const promises = []
    const card = await find_card_for_pr(context)
    if(card) {
      if(card.column_id !== await calculate_column_id(context)) {
        if(card.column_id === columns.PENDING_MERGE) {
          const params = context.issue({body: ':shipit:'})
          promises.push(context.github.issues.createComment(params))
        }
        promises.push(context.github.projects.moveCard({
          card_id: card.card.id,
          position: 'top',
          column_id: await calculate_column_id(context),
        }))
      }
    } else {
      promises.push(context.github.projects.createCard({
        column_id: await calculate_column_id(context),
        content_id: context.payload.pull_request.id,
        content_type: 'PullRequest',
      }))
    }
    return Promise.all(promises)
  })
}
