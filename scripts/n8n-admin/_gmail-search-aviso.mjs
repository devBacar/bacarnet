import { getGmailReadonly } from '../../backend/lib/lib/google/workspaceGoogleClients.js'

const gmail = await getGmailReadonly('admin@bacarsa.com.ar')
const found = await gmail.users.messages.list({
  userId: 'me',
  q: 'newer_than:1d Sistemas',
  maxResults: 10,
})
console.log(JSON.stringify(found.data, null, 2))
