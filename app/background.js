import { createPortProxy } from './extension-scripts/lib/port-proxy'
import { platform } from './extension-scripts/lib/platform'
import { UI_METHODS, STATE_KEY } from './extension-scripts/constants'
import { getPersistedState, persistState } from './extension-scripts/lib/db'
import { migrate } from './extension-scripts/migrations'
import Main from  './extension-scripts/api'
// const persistedState = load state from idb

// instantiate main api for background process
async function constructApi () {
  const rawState = await getPersistedState(STATE_KEY)
  const newVersionState = await migrate(rawState)
  persistedState(newVersionState)
  const main = new Main(newVersionState.state)
  return { main }
}

const ready = constructMainApi()

const state = loadState()

// add listener to extension api
platform.runtime.onConnect.addListener((port) => {
  port.onMessage.addListener(async (msg) => {
    // wait for main api to be ready ie determine network connectivity
    const { main } = await ready

    const params = msg.params || []
    const id = msg.id
    try {
      let response
      // check port name if content-script forward msg to inpage provider
      // otherwise it goes to frontend api
      if (port.name === 'content-script') response = await main.inpageProvider.request(msg)
      else if (port.name === 'ui') {
        // parse api method from route
        const method = uiRouteToApi(msg.route, msg.method, main.getApi())
        response = await method(params)
      }
      port.postMessage({
        id,
        response,
      })
    } catch (error) {
      port.postMessage({
        id,
        error: error.message,
      })

    }
  })
})



function uiRouteToApi (route, method, api) {
  return route.split('/').reduce((apiMethod, path, index, source) => {
    if (!path) return apiMethod
    if (index === source.length - 1) {
      const finalPath = `${UI_METHODS[method]}${path.charAt(0).toUpperCase()}${path.slice(1)}`
      return apiMethod[finalPath]
    }
    return apiMethod[path]
  }, api)
}
