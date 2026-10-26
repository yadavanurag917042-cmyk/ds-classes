(function () {
const app = document.querySelector("#app");
const welcomeScreen = document.querySelector("#welcome-screen");
const dashboard = document.querySelector("#dashboard");
const pageContent = document.querySelector("#page-content");
const loginForm = document.querySelector("#login-form");
const loginMessage = document.querySelector("#login-message");
const adminLoginForm = document.querySelector("#admin-login-form");
const adminLoginMessage = document.querySelector("#admin-login-message");
const config = window.DS_CLASSES_SUPABASE || {};
const backendConfigured = Boolean(
  config.url &&
  config.anonKey &&
  !config.url.includes("YOUR_SUPABASE") &&
  !config.anonKey.includes("YOUR_SUPABASE") &&
  window.supabase?.createClient,
);
const supabase = backendConfigured
  ? window.supabase.createClient(config.url, config.anonKey)
  : null;

let currentView = "home";
let currentUser = null;
let currentProfile = null;
let authPurpose = "student";
let registrationMode = false;
let adminMode = false;
let liveChatChannel = null;
let subscribedLiveSessionIds = "";
let nativePluginsPromise = null;

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]);
}

function message(element, text, isError = false) {
  element.textContent = text;
  element.classList.toggle("message-warning", isError);
}

function heading(eyebrow, title, description = "") {
  return `<div class="page-heading"><div><p class="eyebrow">${escapeHtml(eyebrow)}</p><h2>${escapeHtml(title)}</h2>${description ? `<p>${escapeHtml(description)}</p>` : ""}</div></div>`;
}

function formatDate(value) {
  return new Date(value).toLocaleString("hi-IN", { dateStyle: "medium", timeStyle: "short" });
}

function initials(name) {
  return String(name || "Student").trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() || "").join("");
}

function batchOptions(batches, includeAll = true) {
  return `${includeAll ? '<option value="">Sabhi batches</option>' : '<option value="">Batch chunein</option>'}${batches.map((batch) => `<option value="${escapeHtml(batch.id)}">${escapeHtml(batch.name)} · ${escapeHtml(batch.class_name)}</option>`).join("")}`;
}

function emptyState(text) {
  return `<div class="empty-state">${escapeHtml(text)}</div>`;
}

function noticeCard(notice) {
  return `<article class="notice-card"><span class="notice-icon" aria-hidden="true">♧</span><div><h4>${escapeHtml(notice.title)}</h4><p>${escapeHtml(notice.body)}</p><small>${formatDate(notice.created_at)} · Gulab Sir</small></div></article>`;
}

function renderLiveCard(session, chatMessages = []) {
  const live = session.status === "live";
  const viewerUrl = live ? session.stream_url : session.status === "ended" ? session.recording_url : null;
  const stream = viewerUrl
    ? `<a class="button button-primary button-small" href="${escapeHtml(viewerUrl)}" target="_blank" rel="noopener noreferrer">${live ? "Live class join karein" : "Class recording dekhein"} →</a>`
    : `<span class="community-hint">${session.status === "ended" ? "Recording link available nahi hai." : "Admin ne abhi video link nahi joda."}</span>`;
  const chat = live && session.status === "live"
    ? `<form class="live-chat-form" data-session-id="${escapeHtml(session.id)}"><div class="live-chat-list">${chatMessages.map((item) => `<p><strong>${escapeHtml(item.author_name)}:</strong> ${escapeHtml(item.body)}</p>`).join("") || '<p class="community-hint">Live class mein abhi koi comment nahi hai.</p>'}</div><label class="sr-only" for="chat-${escapeHtml(session.id)}">Live comment</label><div class="live-chat-input"><input id="chat-${escapeHtml(session.id)}" name="body" maxlength="500" placeholder="Live comment likhein..." required><button class="button button-primary button-small" type="submit">Bhejein</button></div></form>`
    : "";
  return `<article class="content-card live-card"><div class="live-preview"><span class="live-label">${live ? "● LIVE CLASS" : "CLASS"}</span><span class="play-button" aria-hidden="true">▶</span></div><div class="live-detail"><p class="eyebrow">${escapeHtml(session.subject)}</p><h4>${escapeHtml(session.title)}</h4><p>${escapeHtml(session.batch?.name || "Sabhi batches")} · ${formatDate(session.starts_at)}</p><div class="live-meta"><span>${live ? "● Live now" : escapeHtml(session.status)}</span></div>${stream}${chat}</div></article>`;
}

function renderHome(profile, liveSessions, notices, noteCount) {
  return `${heading("DS CLASSES · GULAB SIR", `Namaste, ${profile.full_name}`, "Aapki class, notes aur notices — ek hi jagah.")}<section class="stats-grid"><article class="stat-card"><div class="stat-top">Aapka batch <span class="stat-icon">▦</span></div><strong class="stat-value">${escapeHtml(profile.batch?.name || "Batch assign nahi")}</strong></article><article class="stat-card"><div class="stat-top">Study notes <span class="stat-icon">▤</span></div><strong class="stat-value">${noteCount} files</strong></article><article class="stat-card"><div class="stat-top">Notices <span class="stat-icon">♧</span></div><strong class="stat-value">${notices.length}</strong></article></section><div class="section-row"><h3>Quick access</h3></div><section class="quick-grid"><button class="quick-card" data-view="classes" type="button"><span class="quick-icon">▶</span><strong>Live classes</strong><small>Classes aur recordings</small></button><button class="quick-card" data-view="notes" type="button"><span class="quick-icon">▤</span><strong>Study notes</strong><small>Apna study material</small></button><button class="quick-card" data-view="community" type="button"><span class="quick-icon">◎</span><strong>Community</strong><small>Saath milkar seekhein</small></button></section><div class="section-row"><h3>Live classes aur recordings</h3></div>${liveSessions.length ? liveSessions.map(renderLiveCard).join("") : emptyState("Abhi aapke batch ke liye koi class schedule nahi hai.")}<div class="section-row"><h3>Latest notice</h3><button data-view="notices" type="button">Sabhi notices →</button></div>${notices[0] ? noticeCard(notices[0]) : emptyState("Abhi koi notice nahi hai.")}`;
}

function renderNotesList(rows) {
  if (!rows.length) return emptyState("Abhi aapke batch ke liye notes upload nahi kiye gaye hain.");
  return `<div class="notes-list">${rows.map((note) => `<article class="note-card" data-action="open-note" data-id="${escapeHtml(note.id)}" tabindex="0" role="button"><span class="note-icon">▤</span><div class="note-info"><h4>${escapeHtml(note.title)}</h4><p>${escapeHtml(note.subject)}</p><small>${formatDate(note.created_at)}</small></div><span class="download-icon">↓</span></article>`).join("")}</div>`;
}

function renderPosts(rows) {
  if (!rows.length) return emptyState("Abhi community mein koi post nahi hai. Pehli post aap karein!");
  return `<div class="posts-list">${rows.map((post) => `<article class="post-card"><div class="post-head"><span class="user-avatar">${post.avatar_url ? `<img src="${escapeHtml(post.avatar_url)}" alt="">` : escapeHtml(initials(post.author_name))}</span><div><strong>${escapeHtml(post.author_name)}</strong><small>${formatDate(post.created_at)}</small></div></div>${post.body ? `<p class="post-body">${escapeHtml(post.body)}</p>` : ""}${post.image_url ? `<img class="post-image" src="${escapeHtml(post.image_url)}" alt="Community post photo" loading="lazy">` : ""}<div class="post-actions"><span>Community post</span></div></article>`).join("")}</div>`;
}

function renderCommunity(rows) {
  return `${heading("SAATH MILKAR SEEKHEIN", "Community", "Apne batch mein text ya photo share karein. Personal messages nahi hain.")}<form class="community-form" id="community-form"><div class="composer-top"><span class="user-avatar">${escapeHtml(initials(currentProfile.full_name))}</span><div><strong>${escapeHtml(currentProfile.full_name)}</strong><small>${escapeHtml(currentProfile.batch?.name || "Batch assign hone ka intezar")}</small></div></div><label class="field-label" for="post-text">Aap kya share karna chahenge?</label><textarea id="post-text" name="post" maxlength="500" placeholder="Koi sawal, padhai ka tip ya progress share karein..."></textarea><div class="composer-bottom"><div class="composer-tools"><label class="photo-upload" for="post-image">▧ Photo jodein</label><input id="post-image" name="image" type="file" accept="image/jpeg,image/png,image/webp"><span class="community-hint" id="post-image-name">Text ya photo · max 8 MB</span></div><button class="button button-primary button-small" type="submit" ${currentProfile.batch_id ? "" : "disabled"}>Post karein ↗</button></div></form>${rows}`;
}

function renderProfile(profile, avatarUrl) {
  return `${heading("AAPKA ACCOUNT", "Student profile", "Aapki details private hain; doosre students ko sirf community mein naam aur photo dikhte hain.")}<article class="profile-card"><div class="profile-avatar">${avatarUrl ? `<img src="${escapeHtml(avatarUrl)}" alt="Aapki profile photo">` : escapeHtml(initials(profile.full_name))}</div><div class="profile-details"><h3>${escapeHtml(profile.full_name)}</h3><p>DS CLASSES student</p><span class="profile-tag">${escapeHtml(profile.batch?.name || "Batch abhi assign nahi")}</span><form class="avatar-form" id="avatar-form"><label class="photo-upload" for="avatar-file">Profile photo badlein</label><input id="avatar-file" name="file" type="file" accept="image/jpeg,image/png,image/webp" required><button class="button button-secondary button-small" type="submit">Photo save karein</button></form></div><div class="profile-fields"><div class="profile-field"><small>Email</small><strong>${escapeHtml(profile.email || "Email linked nahi hai")}</strong></div><div class="profile-field"><small>Phone number</small><strong>${escapeHtml(profile.phone || "—")}</strong></div><div class="profile-field"><small>Address</small><strong>${escapeHtml(profile.address || "—")}</strong></div></div></article><div class="section-row"><h3>Privacy</h3></div><article class="notice-card"><span class="notice-icon">◉</span><div><h4>Student privacy</h4><p>Community mein naam aur profile photo hi share hote hain. Phone, email aur address doosre students ko nahi dikhte. Personal messaging available nahi hai.</p></div></article><div class="admin-actions"><button class="button button-secondary" type="button" data-action="sign-out">Logout</button></div>`;
}

function adminPanelMarkup(batches, students, liveSessions) {
  const batchMenu = batchOptions(batches);
  const activeSessions = liveSessions.map((session) => `<article class="notice-card"><span class="notice-icon">▶</span><div><h4>${escapeHtml(session.title)} · ${escapeHtml(session.batch?.name || "All batches")}</h4><p>${escapeHtml(session.subject)} · ${escapeHtml(session.status)} · ${formatDate(session.starts_at)}</p><div class="admin-actions">${session.status === "live" ? `<button class="button button-secondary button-small" data-action="end-live" data-id="${escapeHtml(session.id)}" type="button">Live class end karein</button>` : ""}</div>${session.status === "ended" ? `<form class="recording-form admin-form" data-session-id="${escapeHtml(session.id)}"><label>Recording HTTPS link<input name="recording_url" type="url" value="${escapeHtml(session.recording_url || "")}" placeholder="https://..." required></label><button class="button button-secondary button-small" type="submit">Recording link save karein</button></form>` : ""}</div></article>`).join("");
  const studentRows = students.map((student) => `<tr><td>${escapeHtml(student.full_name)}</td><td>${escapeHtml(student.email || "—")}</td><td>${escapeHtml(student.phone || "—")}</td><td>${escapeHtml(student.address || "—")}</td><td><select data-action="assign-batch" data-id="${escapeHtml(student.id)}" aria-label="${escapeHtml(student.full_name)} ka batch"><option value="">Batch assign karein</option>${batches.map((batch) => `<option value="${escapeHtml(batch.id)}" ${student.batch_id === batch.id ? "selected" : ""}>${escapeHtml(batch.name)} · ${escapeHtml(batch.class_name)}</option>`).join("")}</select></td></tr>`).join("");
  return `${heading("SECURE ADMIN PANEL", `Namaste, ${currentProfile.full_name}`, "Students, batches, notices, notes aur live class manage karein.")}<div class="admin-preview"><article class="admin-card"><small>Total students</small><strong>${students.length}</strong><p>Registered student accounts</p></article><article class="admin-card"><small>Active batches</small><strong>${batches.filter((batch) => batch.is_active).length}</strong><p>Student assignment ke liye batches</p></article><article class="admin-card"><small>Live sessions</small><strong>${liveSessions.filter((session) => session.status === "live").length}</strong><p>Abhi chal rahi classes</p></article></div>
    <div class="admin-management">
      <section class="admin-section"><h3>Batch banayein</h3><form class="admin-form" id="batch-form"><label>Batch ka naam<input name="name" maxlength="100" placeholder="Class 10 - 2026" required></label><label>Class<input name="class_name" maxlength="80" placeholder="Class 10" required></label><button class="button button-primary button-small">Batch save karein</button></form></section>
      <section class="admin-section"><h3>Notice bhejein</h3><form class="admin-form" id="notice-form"><label>Batch<select name="batch_id">${batchMenu}</select></label><label>Title<input name="title" maxlength="160" required></label><label>Message<textarea name="body" maxlength="5000" required></textarea></label><button class="button button-primary button-small">Notice publish karein</button></form></section>
      <section class="admin-section"><h3>Notes upload karein</h3><form class="admin-form" id="note-form"><label>Batch<select name="batch_id">${batchMenu}</select></label><label>Subject<input name="subject" maxlength="100" required></label><label>Notes ka naam<input name="title" maxlength="160" required></label><label>PDF file<input name="file" type="file" accept="application/pdf" required></label><button class="button button-primary button-small">PDF upload karein</button></form></section>
      <section class="admin-section"><h3>Live class shuru karein</h3><p class="community-hint">Video room/stream apne provider par banayein aur students ke liye viewer link yahan paste karein. Secret stream keys kabhi na daalein.</p><form class="admin-form" id="live-form"><label>Batch<select name="batch_id" required>${batchOptions(batches, false)}</select></label><label>Subject<input name="subject" maxlength="100" required></label><label>Class ka naam<input name="title" maxlength="160" required></label><label>Students ka HTTPS viewer link<input name="stream_url" type="url" placeholder="https://..." required></label><label>Recording ka HTTPS link (baad mein add kar sakte hain)<input name="recording_url" type="url" placeholder="https://..."></label><button class="button button-primary button-small">Live class publish karein</button></form></section>
    </div>
    <div class="section-row"><h3>Live sessions</h3></div>${activeSessions || emptyState("Abhi koi live session nahi hai.")}
    <div class="section-row"><h3>Students aur batch assignment</h3></div><div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>Naam</th><th>Email</th><th>Phone</th><th>Address</th><th>Batch</th></tr></thead><tbody>${studentRows || `<tr><td colspan="5">Abhi koi student registered nahi hai.</td></tr>`}</tbody></table></div>`;
}

async function getProfile(user) {
  const { data, error } = await supabase
    .from("profiles")
    .select("id,full_name,email,phone,address,avatar_path,batch_id,batches(id,name,class_name)")
    .eq("id", user.id)
    .single();
  if (error) throw error;
  return { ...data, batch: data.batches };
}

function setDashboardVisible(isVisible) {
  welcomeScreen.classList.toggle("hidden", isVisible);
  dashboard.classList.toggle("hidden", !isVisible);
}

async function enterDashboard(user, requiredPurpose = "student") {
  if (!supabase) return;
  if (requiredPurpose === "admin" && user.app_metadata?.role !== "admin") {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    throw new Error("Yeh Google account Supabase mein admin ke roop mein approve nahi hai.");
  }
  currentUser = user;
  currentProfile = await getProfile(user);
  const pendingProfile = sessionStorage.getItem("ds-classes.pending-student-profile");
  if (pendingProfile && requiredPurpose === "student") {
    sessionStorage.removeItem("ds-classes.pending-student-profile");
    const details = JSON.parse(pendingProfile);
    const updates = {
      full_name: details.full_name || currentProfile.full_name,
      phone: details.phone || currentProfile.phone,
      address: details.address || currentProfile.address,
    };
    const { error } = await supabase.from("profiles").update(updates).eq("id", user.id);
    if (error) throw error;
    currentProfile = await getProfile(user);
  }
  adminMode = user.app_metadata?.role === "admin";
  currentView = "home";
  setDashboardVisible(true);
  document.querySelector("#connection-badge").innerHTML = "<span></span> SUPABASE CONNECTED";
  render();
  await loadView();
}

async function loadView() {
  if (!supabase || !currentUser || !currentProfile) return;
  const view = currentView;
  if (view !== "classes" && liveChatChannel) {
    await supabase.removeChannel(liveChatChannel);
    liveChatChannel = null;
    subscribedLiveSessionIds = "";
  }
  pageContent.innerHTML = `<div class="empty-state">Data load ho raha hai…</div>`;
  try {
    if (adminMode) {
      const [batchesResult, studentsResult, liveResult] = await Promise.all([
        supabase.from("batches").select("*").order("name"),
        supabase.from("profiles").select("id,full_name,email,phone,address,batch_id").order("created_at", { ascending: false }),
        supabase.from("live_sessions").select("*,batches(name)").order("starts_at", { ascending: false }),
      ]);
      if (batchesResult.error) throw batchesResult.error;
      if (studentsResult.error) throw studentsResult.error;
      if (liveResult.error) throw liveResult.error;
      if (!adminMode) return;
      const liveSessions = liveResult.data.map((session) => ({ ...session, batch: session.batches }));
      pageContent.innerHTML = adminPanelMarkup(batchesResult.data, studentsResult.data, liveSessions);
      return;
    }

    if (view === "home") {
      const [noticesResult, notesResult, liveResult] = await Promise.all([
        supabase.from("notices").select("*").order("created_at", { ascending: false }).limit(5),
        supabase.from("study_materials").select("id", { count: "exact", head: true }),
        supabase.from("live_sessions").select("*,batches(name)").in("status", ["live", "scheduled"]).order("starts_at", { ascending: false }).limit(5),
      ]);
      if (noticesResult.error) throw noticesResult.error;
      if (notesResult.error) throw notesResult.error;
      if (liveResult.error) throw liveResult.error;
      if (view === currentView) pageContent.innerHTML = renderHome(currentProfile, liveResult.data.map((item) => ({ ...item, batch: item.batches })), noticesResult.data, notesResult.count || 0);
    } else if (view === "notices") {
      const { data, error } = await supabase.from("notices").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      if (view === currentView) pageContent.innerHTML = `${heading("GULAB SIR KI TARAF SE", "Notices", "Aapke batch ke liye zaroori jaankari.")}<div class="notice-list">${data.length ? data.map(noticeCard).join("") : emptyState("Abhi koi notice nahi hai.")}</div>`;
    } else if (view === "notes") {
      const { data, error } = await supabase.from("study_materials").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      if (view === currentView) pageContent.innerHTML = `${heading("PADHO AUR PRACTICE KARO", "Study notes", "Aapke batch ke liye upload kiye gaye PDF notes.")}${renderNotesList(data)}`;
    } else if (view === "classes") {
      const { data, error } = await supabase.from("live_sessions").select("*,batches(name)").order("starts_at", { ascending: false });
      if (error) throw error;
      const sessions = data.map((session) => ({ ...session, batch: session.batches }));
      const live = sessions.filter((session) => session.status === "live");
      const archived = sessions.filter((session) => session.status !== "live");
      const chatResult = live.length
        ? await supabase.from("live_chat").select("*").in("session_id", live.map((session) => session.id)).order("created_at", { ascending: true }).limit(200)
        : { data: [], error: null };
      if (chatResult.error) throw chatResult.error;
      const sessionIds = live.map((session) => session.id).sort().join(",");
      if (sessionIds !== subscribedLiveSessionIds) {
        if (liveChatChannel) await supabase.removeChannel(liveChatChannel);
        liveChatChannel = null;
        subscribedLiveSessionIds = sessionIds;
        if (sessionIds) {
          const sessionIdSet = new Set(sessionIds.split(","));
          liveChatChannel = supabase
            .channel("ds-classes-live-chat")
            .on("postgres_changes", { event: "INSERT", schema: "public", table: "live_chat" }, (payload) => {
              if (currentView === "classes" && sessionIdSet.has(payload.new.session_id)) void loadView();
            })
            .subscribe();
        }
      }
      if (supabase && liveChatChannel) {
        await supabase.removeChannel(liveChatChannel);
        liveChatChannel = null;
        subscribedLiveSessionIds = "";
      }
      const messagesBySession = new Map();
      for (const chatMessage of chatResult.data) {
        const messages = messagesBySession.get(chatMessage.session_id) || [];
        messages.push(chatMessage);
        messagesBySession.set(chatMessage.session_id, messages);
      }
      if (view === currentView) pageContent.innerHTML = `${heading("PADHAI KA SAMAY", "Classes", "Live sessions aur class recordings.")}<div class="section-row"><h3>Live session</h3></div>${live.length ? live.map((session) => renderLiveCard(session, messagesBySession.get(session.id) || [])).join("") : emptyState("Abhi koi class live nahi hai.")}<div class="section-row"><h3>Scheduled classes aur recordings</h3></div>${archived.length ? archived.map(renderLiveCard).join("") : emptyState("Abhi koi recording nahi hai.")}`;
    } else if (view === "community") {
      const { data, error } = await supabase.from("community_posts").select("*").order("created_at", { ascending: false }).limit(50);
      if (error) throw error;
      const postsWithImages = await Promise.all(data.map(async (post) => {
        const [imageResult, avatarResult] = await Promise.all([
          post.image_path ? supabase.storage.from("community-images").createSignedUrl(post.image_path, 300) : Promise.resolve({ data: null, error: null }),
          post.author_avatar_path ? supabase.storage.from("student-avatars").createSignedUrl(post.author_avatar_path, 300) : Promise.resolve({ data: null, error: null }),
        ]);
        if (imageResult.error) throw imageResult.error;
        if (avatarResult.error) throw avatarResult.error;
        return {
          ...post,
          image_url: imageResult.data?.signedUrl,
          avatar_url: avatarResult.data?.signedUrl,
        };
      }));
      if (view === currentView) pageContent.innerHTML = renderCommunity(renderPosts(postsWithImages));
    } else if (view === "profile") {
      const profile = await getProfile(currentUser);
      currentProfile = profile;
      const avatarResult = profile.avatar_path
        ? await supabase.storage.from("student-avatars").createSignedUrl(profile.avatar_path, 300)
        : { data: null, error: null };
      if (avatarResult.error) throw avatarResult.error;
      if (view === currentView) pageContent.innerHTML = renderProfile(profile, avatarResult.data?.signedUrl);
    }
  } catch (error) {
    if (view === currentView) {
      pageContent.innerHTML = `${heading("DS CLASSES", "Data load nahi hua")}<div class="empty-state">${escapeHtml(error.message || "Backend request fail hui. Supabase setup aur access policies check karein.")}</div>`;
    }
  }
}

function render() {
  document.querySelectorAll("[data-view]").forEach((button) => {
    button.classList.toggle("active", !adminMode && button.dataset.view === currentView);
  });
}

function oauthRedirectUrl() {
  if (window.Capacitor?.isNativePlatform?.()) {
    return "com.dsclasses.app://login-callback/";
  }
  if (!["http:", "https:"].includes(window.location.protocol)) {
    throw new Error("Web login ke liye app ko file se nahi, HTTP/HTTPS URL se kholein. Android app mein Google login button use karein.");
  }
  const redirectUrl = new URL(window.location.pathname, window.location.origin);
  return redirectUrl.toString();
}

async function startGoogleSignIn(purpose) {
  authPurpose = purpose;
  const target = purpose === "admin" ? adminLoginMessage : loginMessage;
  if (purpose === "admin") sessionStorage.removeItem("ds-classes.pending-student-profile");
  if (!supabase) {
    message(target, "Google login ke liye Supabase project configuration zaroori hai.", true);
    return;
  }
  sessionStorage.setItem("ds-classes.oauth-purpose", purpose);

  const isNative = Boolean(window.Capacitor?.isNativePlatform?.());
  if (purpose === "student" && registrationMode) {
    const fields = document.querySelector("#registration-fields");
    if (!fields.querySelector("#student-name").reportValidity()
      || !fields.querySelector("#student-phone").reportValidity()
      || !fields.querySelector("#student-address").reportValidity()) return;
    sessionStorage.setItem("ds-classes.pending-student-profile", JSON.stringify({
      full_name: fields.querySelector("#student-name").value.trim(),
      phone: fields.querySelector("#student-phone").value.trim(),
      address: fields.querySelector("#student-address").value.trim(),
    }));
  } else if (purpose === "student") {
    sessionStorage.removeItem("ds-classes.pending-student-profile");
  }

  const button = document.querySelector(purpose === "admin" ? "#admin-google-login" : "#student-google-login");
  button.disabled = true;
  message(target, "Google login khola ja raha hai…");
  let browserCloseListener = null;
  try {
    if (isNative) await loadNativePlugins();
    const browser = window.Capacitor?.Plugins?.Browser;
    if (isNative && !browser) {
      throw new Error("Android Google login ke liye Browser plugin available nahi hai. App ko dobara build karein.");
    }
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: oauthRedirectUrl(),
        skipBrowserRedirect: isNative,
      },
    });
    if (error) throw error;
    if (isNative) {
      if (!data.url) throw new Error("Supabase ne Google login URL nahi diya.");
      browserCloseListener = await browser.addListener("browserFinished", () => {
        button.disabled = false;
        void browserCloseListener.remove();
      });
      await browser.open({ url: data.url });
    }
  } catch (error) {
    sessionStorage.removeItem("ds-classes.oauth-purpose");
    if (browserCloseListener) await browserCloseListener.remove();
    sessionStorage.removeItem("ds-classes.pending-student-profile");
    message(target, error.message || "Google login shuru nahi ho saka.", true);
    button.disabled = false;
  }
}

function showAuth(purpose = "student") {
  authPurpose = purpose;
  const isAdmin = purpose === "admin";
  loginForm.classList.toggle("hidden", isAdmin);
  adminLoginForm.classList.toggle("hidden", !isAdmin);
  document.querySelector("#admin-login-button").classList.toggle("hidden", isAdmin);
  if (isAdmin) {
    message(adminLoginMessage, "Sirf Supabase mein admin role wala Google account anumodit hai.");
  } else {
    registrationMode = false;
    document.querySelector("#registration-fields").classList.add("hidden");
    document.querySelector("#register-toggle").textContent = "Naye student? Account banayein";
    ["name", "phone", "address"].forEach((name) => {
      document.querySelector(`#student-${name}`).required = false;
    });
  }
}

function formValues(form) {
  return Object.fromEntries(new FormData(form).entries());
}

async function submitDataForm(form) {
  const values = formValues(form);
  if (form.id === "batch-form") {
    const { error } = await supabase.from("batches").insert({ name: values.name.trim(), class_name: values.class_name.trim() });
    if (error) throw error;
  } else if (form.id === "notice-form") {
    const { error } = await supabase.from("notices").insert({
      batch_id: values.batch_id || null,
      title: values.title.trim(),
      body: values.body.trim(),
      created_by: currentUser.id,
    });
    if (error) throw error;
  } else if (form.id === "note-form") {
    const file = form.elements.file.files[0];
    if (!file || file.type !== "application/pdf" || file.size > 25 * 1024 * 1024) {
      throw new Error("25 MB tak ki valid PDF file chunein.");
    }
    const path = `${currentUser.id}/${crypto.randomUUID()}.pdf`;
    const { error: uploadError } = await supabase.storage.from("study-notes").upload(path, file, { contentType: "application/pdf", upsert: false });
    if (uploadError) throw uploadError;
    const { error: insertError } = await supabase.from("study_materials").insert({
      batch_id: values.batch_id || null,
      title: values.title.trim(),
      subject: values.subject.trim(),
      storage_path: path,
      created_by: currentUser.id,
    });
    if (insertError) {
      const { error: cleanupError } = await supabase.storage.from("study-notes").remove([path]);
      if (cleanupError) console.error("Uploaded note cleanup failed:", cleanupError.message);
      throw insertError;
    }
  } else if (form.id === "live-form") {
    const streamUrl = new URL(values.stream_url);
    if (streamUrl.protocol !== "https:") throw new Error("Viewer link HTTPS hona chahiye.");
    const recordingUrl = values.recording_url ? new URL(values.recording_url) : null;
    if (recordingUrl && recordingUrl.protocol !== "https:") throw new Error("Recording link HTTPS hona chahiye.");
    const { error } = await supabase.from("live_sessions").insert({
      batch_id: values.batch_id,
      subject: values.subject.trim(),
      title: values.title.trim(),
      stream_url: streamUrl.href,
      recording_url: recordingUrl?.href || null,
      status: "live",
      starts_at: new Date().toISOString(),
      created_by: currentUser.id,
    });
    if (error) throw error;
  } else if (form.id === "avatar-form") {
    const file = form.elements.file.files[0];
    if (!file || !["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 5 * 1024 * 1024) {
      throw new Error("JPG, PNG ya WebP format mein 5 MB tak ki photo chunein.");
    }
    const extension = file.type.split("/")[1].replace("jpeg", "jpg");
    const path = `${currentUser.id}/${crypto.randomUUID()}.${extension}`;
    const { error: uploadError } = await supabase.storage.from("student-avatars").upload(path, file, { contentType: file.type, upsert: false });
    if (uploadError) throw uploadError;
    const { error: updateError } = await supabase.from("profiles").update({ avatar_path: path }).eq("id", currentUser.id);
    if (updateError) {
      const { error: cleanupError } = await supabase.storage.from("student-avatars").remove([path]);
      if (cleanupError) console.error("Avatar cleanup failed:", cleanupError.message);
      throw updateError;
    }
    currentProfile = await getProfile(currentUser);
  } else if (form.classList.contains("recording-form")) {
    const recordingUrl = new URL(values.recording_url);
    if (recordingUrl.protocol !== "https:") throw new Error("Recording link HTTPS hona chahiye.");
    const { error } = await supabase
      .from("live_sessions")
      .update({ recording_url: recordingUrl.href })
      .eq("id", form.dataset.sessionId);
    if (error) throw error;
  }
  form.reset();
  await loadView();
}

async function submitCommunityPost(form) {
  const body = form.elements.post.value.trim();
  const image = form.elements.image.files[0];
  if (!body && !image) throw new Error("Post mein text ya photo add karein.");
  if (image && (!["image/jpeg", "image/png", "image/webp"].includes(image.type) || image.size > 8 * 1024 * 1024)) {
    throw new Error("JPG, PNG ya WebP format mein 8 MB tak ki photo chunein.");
  }

  let imagePath = null;
  if (image) {
    imagePath = `${currentUser.id}/${crypto.randomUUID()}.${image.type.split("/")[1].replace("jpeg", "jpg")}`;
    const { error } = await supabase.storage.from("community-images").upload(imagePath, image, { contentType: image.type, upsert: false });
    if (error) throw error;
  }
  const { error } = await supabase.from("community_posts").insert({
    batch_id: currentProfile.batch_id,
    author_id: currentUser.id,
    author_name: currentProfile.full_name,
    body,
    image_path: imagePath,
  });
  if (error) {
    if (imagePath) {
      const { error: cleanupError } = await supabase.storage.from("community-images").remove([imagePath]);
      if (cleanupError) console.error("Community image cleanup failed:", cleanupError.message);
    }
    throw error;
  }
  await loadView();
}

async function submitLiveComment(form) {
  const { error } = await supabase.from("live_chat").insert({
    session_id: form.dataset.sessionId,
    author_id: currentUser.id,
    author_name: currentProfile.full_name,
    body: form.elements.body.value.trim(),
  });
  if (error) throw error;
  await loadView();
}

async function leaveDashboard() {
  if (supabase && currentUser) {
    const { error } = await supabase.auth.signOut();
    if (error) {
      alert(`Logout nahi hua: ${error.message}`);
      return;
    }
  }
  if (supabase && liveChatChannel) {
    await supabase.removeChannel(liveChatChannel);
    liveChatChannel = null;
    subscribedLiveSessionIds = "";
  }
  currentUser = null;
  currentProfile = null;
  adminMode = false;
  setDashboardVisible(false);
}

app.addEventListener("click", async (event) => {
  const button = event.target.closest("button, [data-action='open-note']");
  if (!button) return;
  if (button.dataset.view) {
    currentView = button.dataset.view;
    render();
    if (supabase && currentUser) await loadView();
    window.scrollTo(0, 0);
    return;
  }
  if (button.dataset.action === "sign-out") {
    await leaveDashboard();
    return;
  }
  if (button.dataset.action === "open-note" && supabase && currentUser) {
    const { data, error } = await supabase.from("study_materials").select("storage_path").eq("id", button.dataset.id).single();
    if (error) {
      alert(`Note load nahi hua: ${error.message}`);
      return;
    }
    const { data: link, error: linkError } = await supabase.storage.from("study-notes").createSignedUrl(data.storage_path, 300);
    if (linkError) {
      alert(`PDF link nahi bana: ${linkError.message}`);
      return;
    }
    window.open(link.signedUrl, "_blank", "noopener,noreferrer");
    return;
  }
  if (button.dataset.action === "end-live" && supabase) {
    const { error } = await supabase.from("live_sessions").update({ status: "ended", ended_at: new Date().toISOString() }).eq("id", button.dataset.id);
    if (error) alert(`Class end nahi hui: ${error.message}`);
    else await loadView();
  }
});

app.addEventListener("change", async (event) => {
  if (event.target.id === "post-image") {
    document.querySelector("#post-image-name").textContent = event.target.files[0]?.name || "Text ya photo · max 8 MB";
  }
  if (event.target.dataset.action === "assign-batch" && supabase) {
    const batchId = event.target.value;
    const { error } = await supabase.from("profiles").update({ batch_id: batchId || null }).eq("id", event.target.dataset.id);
    if (error) {
      alert(`Batch assign nahi hua: ${error.message}`);
      await loadView();
    }
  }
});

app.addEventListener("submit", async (event) => {
  const form = event.target;
  if (["batch-form", "notice-form", "note-form", "live-form", "community-form", "avatar-form"].includes(form.id) || form.classList.contains("live-chat-form") || form.classList.contains("recording-form")) {
    event.preventDefault();
    const submit = form.querySelector("[type='submit']");
    submit.disabled = true;
    try {
      if (form.id === "community-form") await submitCommunityPost(form);
        else if (form.classList.contains("live-chat-form")) await submitLiveComment(form);
        else await submitDataForm(form);
    } catch (error) {
      alert(error.message || "Request poori nahi hui.");
    } finally {
      submit.disabled = false;
    }
  }
});

document.querySelector("#student-google-login").addEventListener("click", () => {
  void startGoogleSignIn("student");
});
document.querySelector("#admin-google-login").addEventListener("click", () => {
  void startGoogleSignIn("admin");
});
document.querySelector("#admin-login-button").addEventListener("click", () => {
  showAuth("admin");
});
document.querySelector("#register-toggle").addEventListener("click", () => {
  registrationMode = !registrationMode;
  document.querySelector("#registration-fields").classList.toggle("hidden", !registrationMode);
  document.querySelector("#register-toggle").textContent = registrationMode
    ? "Pehle se account hai? Login karein"
    : "Naye student? Account banayein";
  ["name", "phone", "address"].forEach((name) => {
    document.querySelector(`#student-${name}`).required = registrationMode;
  });
});
document.querySelector("#admin-login-back").addEventListener("click", () => showAuth("student"));
document.querySelector("#back-to-welcome").addEventListener("click", leaveDashboard);

pageContent.addEventListener("keydown", (event) => {
  if ((event.key === "Enter" || event.key === " ") && event.target.matches("[data-action='open-note']")) {
    event.preventDefault();
    event.target.click();
  }
});

async function finishOAuthCallback(callbackUrl) {
  const url = new URL(callbackUrl);
  const purpose = sessionStorage.getItem("ds-classes.oauth-purpose") === "admin" ? "admin" : "student";
  sessionStorage.removeItem("ds-classes.oauth-purpose");
  const target = purpose === "admin" ? adminLoginMessage : loginMessage;
  const providerError = url.searchParams.get("error_description") || url.searchParams.get("error");
  if (providerError) {
    sessionStorage.removeItem("ds-classes.pending-student-profile");
    document.querySelector(purpose === "admin" ? "#admin-google-login" : "#student-google-login").disabled = false;
    showAuth(purpose);
    message(target, providerError, true);
    return;
  }
  const code = url.searchParams.get("code");
  if (!code) return;

  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    document.querySelector(purpose === "admin" ? "#admin-google-login" : "#student-google-login").disabled = false;
    showAuth(purpose);
    message(target, `Google login complete nahi hua: ${error.message}`, true);
    return;
  }
  try {
    await enterDashboard(data.session.user, purpose);
    history.replaceState(null, "", window.location.pathname);
  } catch (loginError) {
    document.querySelector(purpose === "admin" ? "#admin-google-login" : "#student-google-login").disabled = false;
    showAuth(purpose);
    message(target, loginError.message || "Login complete nahi hua.", true);
  }
}

function loadPluginScript(source) {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = source;
    script.onload = resolve;
    script.onerror = () => reject(new Error(`Native plugin load nahi hua: ${source}`));
    document.head.append(script);
  });
}

function loadNativePlugins() {
  if (!window.Capacitor?.isNativePlatform?.()) return Promise.resolve();
  if (!nativePluginsPromise) {
    nativePluginsPromise = (async () => {
      await loadPluginScript("capacitor-app.js");
      await loadPluginScript("capacitor-browser.js");
    })();
  }
  return nativePluginsPromise;
}

async function start() {
  const isNative = Boolean(window.Capacitor?.isNativePlatform?.());
  if (isNative) await loadNativePlugins();
  const appPlugin = window.Capacitor?.Plugins?.App;
  if (isNative && appPlugin) {
    await appPlugin.addListener("appUrlOpen", async ({ url }) => {
      try {
        try {
          await window.Capacitor.Plugins.Browser?.close();
        } catch (error) {
          console.warn("OAuth browser close failed:", error);
        }
        await finishOAuthCallback(url);
      } catch (error) {
        showAuth(authPurpose);
        message(authPurpose === "admin" ? adminLoginMessage : loginMessage, error.message || "Google callback handle nahi hua.", true);
      }
    });
  }
  if (!backendConfigured) return;
  const callbackPurpose = sessionStorage.getItem("ds-classes.oauth-purpose") === "admin" ? "admin" : "student";
  if (callbackPurpose === "admin") showAuth("admin");
  const { data, error } = await supabase.auth.getSession();
  if (error) {
    message(callbackPurpose === "admin" ? adminLoginMessage : loginMessage, `Supabase session check fail hua: ${error.message}`, true);
    return;
  }
  if (data.session) {
    try {
      await enterDashboard(data.session.user, callbackPurpose);
      if (sessionStorage.getItem("ds-classes.oauth-purpose")) {
        sessionStorage.removeItem("ds-classes.oauth-purpose");
        history.replaceState(null, "", window.location.pathname);
      }
    } catch (profileError) {
      sessionStorage.removeItem("ds-classes.oauth-purpose");
      showAuth(callbackPurpose === "admin" ? "admin" : "student");
      message(callbackPurpose === "admin" ? adminLoginMessage : loginMessage, profileError.message || "Profile load nahi hua.", true);
    }
  }
}

showAuth("student");
void start();
})();
