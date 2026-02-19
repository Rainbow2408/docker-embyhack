// original crypto.js (new version)
globalThis.crypto||(globalThis.crypto={}),crypto.randomUUID||(crypto.getRandomValues?crypto.randomUUID=function(){return([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g,function(c){return(c^crypto.getRandomValues(new Uint8Array(1))[0]&15>>c/4).toString(16)})}:crypto.randomUUID=function(){return"xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g,function(c){var r=16*Math.random()|0;return("x"===c?r:3&r|8).toString(16)})});

// --- PATCH FETCH ---
/**
 * ### FETCH OVERRIDE ###
 * Intercepts specific API calls to the Emby server to provide a mock response,
 * effectively bypassing registration checks.
 */
const originalFetch = window.fetch;

// Defines the shape of the mock API responses.
const mockApiEndpoints = {
  '/admin/service/registration/validateDevice': ({
    cacheExpirationDays: 3650,
    message: "Device Valid",
    resultCode: "GOOD"
  }),
  '/admin/service/registration/validate': ({
    featId: "",
    registered: true,
    expDate: "2099-01-01",
    key: ""
  }),
  '/admin/service/registration/getStatus': ({
    deviceStatus: "",
    planType: "",
    subscriptions: {}
  }),
};

/**
 * Creates a mock Response object.
 * @param data The stringified JSON data to return.
 * @returns A Promise that resolves with a mock Response.
 */
const createMockResponse = (data) => Promise.resolve({
  status: 200,
  text: () => JSON.stringify(data),
  json: () => data,
});

/**
 * Overridden window.fetch function.
 * It checks if the request URL matches a mocked endpoint and returns the mock response.
 * Otherwise, it proceeds with the original fetch request.
 */
window.fetch = function () {
  try {
    let url = arguments[0];

    // Handle Request object
    if (url instanceof Request) {
      url = url.url;
    }

    if (typeof url === 'string') {
      // Normalize URL (handle potential undefined or null)
      const urlString = url.toString();

      const keys = Object.keys(mockApiEndpoints);
      for (let i = 0; i < keys.length; i++) {
        const key = keys[i];
        if (urlString.indexOf(key) !== -1) {
          console.log(`[EmbyHack] Intercepted: ${key}`);
          const data = mockApiEndpoints[key];
          return createMockResponse(data);
        }
      }
    }
  } catch (e) {
    console.error('[EmbyHack] Mock fetch failed', e);
    // fall back to originalFetch
  }

  return originalFetch.apply(this, arguments);
};

// --- PATCH NOTICE ---
// --- NOTICE HTML & CSS ---
const noticeHTML = `
      <div class="emby-drawer-notice">
          <div class="notice-content">
              <strong class="notice-title">Support Emby with your love</strong>
              <p>
                  <a href="https://emby.media/premiere.html" target="_blank" rel="noopener noreferrer">Buy Emby Premiere</a> to unlock great features and support development.
              </p>
              <p style="font-size: 10px; color: #aaa; margin-top: 5px;">This message will show only once.</p>
          </div>
          <button class="emby-notice-toggle-btn" title="Close">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
      </div>
  `;

const noticeCSS = `
      .emby-drawer-notice {
          position: fixed;
          top: 80px;
          right: 50px;
          width: 300px;
          height: 130px; /* Increased height for title */
          background-color: #1c1c1e;
          color: #fff;
          z-index: 99999;
          border-radius: 10px;
          box-shadow: 0 5px 20px rgba(0, 0, 0, 0.4);
          display: none; /* Hidden by default */
          overflow: hidden;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          font-size: 14px;
          border: 1px solid #333;
          cursor: move;
      }
      .emby-drawer-notice.dragging {
          transition: none;
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
      }
      .emby-drawer-notice .notice-content {
          padding: 15px;
          display: flex;
          flex-direction: column;
          justify-content: center;
          height: 100%;
          box-sizing: border-box;
      }
      .notice-title {
          font-size: 16px;
          font-weight: bold;
          color: #fff;
          margin: 0 0 8px 0;
      }
      .emby-drawer-notice .notice-content p {
          margin: 0;
          line-height: 1.5;
          color: #ccc;
      }
      .emby-drawer-notice .notice-content a {
          color: #00a4dc;
          text-decoration: none;
          font-weight: bold;
          cursor: pointer;
      }
      .emby-drawer-notice .notice-content a:hover {
          text-decoration: underline;
      }
      .emby-notice-toggle-btn {
          position: absolute;
          top: 10px;
          right: 10px;
          width: 30px;
          height: 30px;
          background: rgba(255, 255, 255, 0.1);
          border: none;
          border-radius: 50%;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #fff;
          padding: 0;
      }
      .emby-notice-toggle-btn:hover {
          background: rgba(255, 255, 255, 0.2);
      }
      .emby-notice-toggle-btn svg {
          width: 18px;
          height: 18px;
      }
  `;

// --- SCRIPT LOGIC ---

function initializeNotice() {
  if (document.cookie.indexOf('emby_hack_notice_closed=true') !== -1) {
    return;
  }

  if (document.querySelector('.emby-drawer-notice')) {
    return;
  }

  const styleSheet = document.createElement("style");
  styleSheet.innerText = noticeCSS;
  (document.head || document.documentElement).appendChild(styleSheet);

  const noticeContainer = document.createElement('div');
  noticeContainer.innerHTML = noticeHTML;
  const noticeEl = noticeContainer.firstElementChild;
  if (!noticeEl) {
    return;
  }
  const notice = noticeEl;
  (document.body || document.documentElement).appendChild(notice);

  const toggleBtn = notice.querySelector('.emby-notice-toggle-btn');
  const link = notice.querySelector('a')

  if (!toggleBtn || !link) return;

  let startX, startY;

  toggleBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    e.preventDefault();
    document.cookie = "emby_hack_notice_closed=true; max-age=31536000; path=/";
    notice.remove();
  });

  let initialRight, initialTop;
  let initialMouseX, initialMouseY;

  function onMouseDown(e) {
    if (e.target === link || (e.target instanceof Node && link.contains(e.target))) {
      return;
    }

    startX = e.clientX;
    startY = e.clientY;

    notice.style.userSelect = 'none';
    notice.classList.add('dragging');

    initialRight = parseInt(getComputedStyle(notice).right, 10);
    initialTop = parseInt(getComputedStyle(notice).top, 10);
    initialMouseX = e.clientX;
    initialMouseY = e.clientY;

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }

  function onMouseMove(e) {
    e.preventDefault();

    const dx = e.clientX - initialMouseX;
    const dy = e.clientY - initialMouseY;

    let newRight = initialRight - dx;
    let newTop = initialTop + dy;

    const marginX = 50;
    const marginY = 80;
    const minRight = marginX;
    const maxRight = window.innerWidth - notice.offsetWidth - marginX;
    const minTop = marginY;
    const maxTop = window.innerHeight - notice.offsetHeight - marginY;

    newRight = Math.max(minRight, Math.min(newRight, maxRight));
    newTop = Math.max(minTop, Math.min(newTop, maxTop));

    notice.style.right = `${newRight}px`;
    notice.style.top = `${newTop}px`;
  }

  function onMouseUp() {
    notice.style.userSelect = 'auto';
    notice.classList.remove('dragging');
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
  }

  notice.addEventListener('mousedown', onMouseDown);


  // Emby.Page.getRoutes().filter(a => a.settingsTheme).map(a => a.path).join(',')
  const settingsRoutes = '/settings,/settings/keyboard.html,/settings/notifications.html,/settings/playback.html,/settings/appgeneral.html,/settings/appplayback.html,/settings/subtitles.html,/settings/display.html,/settings/homescreen.html,/settings/profile.html,/plugins/install,/database,/dashboard,/dashboard.html,/dashboard/settings,/devices,/network,/devices/device.html,/devices/cameraupload.html,/transcoding,/librarysetup,/livetvsetup,/livetvsetup/guideprovider.html,/livetvsetup/livetvtuner.html,/logs,/log,/plugins,/dashboard/releasenotes.html,/scheduledtasks,/scheduledtask,/serveractivity,/apikeys,/embypremiere,/serverdownloads,/conversions,/users/user,/users/new,/users,/wizard/wizardagreement.html,/wizard/wizardremoteaccess.html,/wizard/wizardfinish.html,/wizard/wizardlibrary.html,/wizard/wizardstart.html,/wizard/wizarduser.html,/configurationpage,/genericui'
    .split(',')

  // Function to be called when the hash is '#a'
  function openNotice() {
    // Add your code here to display the notice
    notice.style.display = 'block'
  }

  // Function to be called for any other hash
  function closeNotice() {
    // Add your code here to hide the notice
    notice.style.display = 'none'
  }

  // Function to check the hash and call the appropriate function
  function handleHashChange() {
    const route = location.hash.replace(/^#!/, '').replace(/\?.*/, '')
    const shouldShowNotice = settingsRoutes.includes(route)
    if (shouldShowNotice) {
      openNotice();
    } else {
      closeNotice();
    }
  }

  // --- The Event Listeners & Hooks ---

  // 1. Listen for user navigation (back/forward buttons) and direct hash changes
  window.addEventListener('popstate', handleHashChange);
  window.addEventListener('hashchange', handleHashChange);

  // 2. Hook pushState and replaceState to catch programmatic changes
  ['pushState', 'replaceState'].forEach((method) => {
    const original = history[method];
    history[method] = function (...args) {
      // Call the original browser method
      original.apply(history, args);
      // Manually trigger our handler
      handleHashChange();
    };
  });

  // 3. Call the function on initial page load to check the current URL
  handleHashChange();
}

// --- INITIALIZATION ---
// Run immediately. The CSS now handles visibility, so no observer is needed.
initializeNotice();
