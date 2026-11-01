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
  ? window.supabase.createClient(config.url, config.anonKey, {
      auth: {
        flowType: "pkce",
      },
    })
  : null;

let currentView = "home";
let currentUser = null;
let currentProfile = null;
let authPurpose = "student";
let registrationMode = false;
let adminMode = false;
let liveChatChannel = null;
let subscribedLiveSessionIds = "";
let inboxChannel = null;
let currentInboxThreadId = null;
let nativePluginsPromise = null;
let adminStudentFunctionsAvailable = true;
const supportedViews = new Set(["home", "notices", "classes", "notes", "community", "inbox", "profile", "admin"]);

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

function rpcUnavailable(error) {
  return error?.code === "PGRST202";
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
  return `${heading("DS CLASSES · GULAB SIR", `Namaste, ${profile.full_name}`, "Aapki class, notes aur notices — ek hi jagah.")}<section class="stats-grid"><article class="stat-card"><div class="stat-top">Aapka batch <span class="stat-icon">▦</span></div><strong class="stat-value">${escapeHtml(profile.batch?.name || "Batch assign nahi")}</strong></article><article class="stat-card"><div class="stat-top">Study notes <span class="stat-icon">▤</span></div><strong class="stat-value">${noteCount} files</strong></article><article class="stat-card"><div class="stat-top">Notices <span class="stat-icon">♧</span></div><strong class="stat-value">${notices.length}</strong></article></section><div class="section-row"><h3>Quick access</h3></div><section class="quick-grid"><button class="quick-card" data-view="classes" type="button"><span class="quick-icon">▶</span><strong>Live classes</strong><small>Classes aur recordings</small></button><button class="quick-card" data-view="notes" type="button"><span class="quick-icon">▤</span><strong>Study notes</strong><small>Apna study material</small></button><button class="quick-card" data-view="community" type="button"><span class="quick-icon">◎</span><strong>Community</strong><small>Saath milkar seekhein</small></button></section><div class="section-row"><h3>Live classes aur recordings</h3></div>${liveSessions.length ? liveSessions.map((session) => renderLiveCard(session)).join("") : emptyState("Abhi aapke batch ke liye koi class schedule nahi hai.")}<div class="section-row"><h3>Latest notice</h3><button data-view="notices" type="button">Sabhi notices →</button></div>${notices[0] ? noticeCard(notices[0]) : emptyState("Abhi koi notice nahi hai.")}`;
}

function renderNotesList(rows) {
  if (!rows.length) return emptyState("Abhi aapke batch ke liye notes upload nahi kiye gaye hain.");
  return `<div class="notes-list">${rows.map((note) => `<article class="note-card" data-action="open-note" data-id="${escapeHtml(note.id)}" tabindex="0" role="button"><span class="note-icon">▤</span><div class="note-info"><h4>${escapeHtml(note.title)}</h4><p>${escapeHtml(note.subject)}</p><small>${formatDate(note.created_at)}</small></div><span class="download-icon">↓</span></article>`).join("")}</div>`;
}

function renderPosts(rows, commentsEnabled = true) {
  if (!rows.length) return emptyState("Abhi community mein koi post nahi hai. Pehli post aap karein!");
  return `<div class="posts-list">${rows.map((post) => `<article class="post-card"><div class="post-head"><span class="user-avatar">${post.avatar_url ? `<img src="${escapeHtml(post.avatar_url)}" alt="">` : escapeHtml(initials(post.author_name))}</span><div><strong>${escapeHtml(post.author_name)}</strong><small>${formatDate(post.created_at)}</small></div></div>${post.body ? `<p class="post-body">${escapeHtml(post.body)}</p>` : ""}${post.image_url ? `<img class="post-image" src="${escapeHtml(post.image_url)}" alt="Community post photo" loading="lazy">` : ""}<div class="community-comments">${(post.comments || []).map((comment) => `<p><strong>${escapeHtml(comment.author_name)}:</strong> ${escapeHtml(comment.body)} <small>${formatDate(comment.created_at)}</small></p>`).join("")}${commentsEnabled ? `<form class="community-comment-form" data-post-id="${escapeHtml(post.id)}"><input name="body" maxlength="1000" placeholder="Comment likhein..." aria-label="Comment" required><button class="button button-secondary button-small" type="submit">Reply</button></form>` : ""}</div></article>`).join("")}</div>`;
}

function renderCommunity(rows, batches = [], statusMessage = "") {
  const adminBatchPicker = adminMode
    ? `<label class="field-label" for="post-batch">Post kis batch ko dikhani hai?</label><select id="post-batch" name="batch_id" required>${batchOptions(batches, false)}</select>`
    : "";
  return `${heading("SAATH MILKAR SEEKHEIN", "Community", "Apne batch ke students aur admin ke saath posts aur comments share karein.")}${statusMessage ? `<p class="community-hint" role="status">${escapeHtml(statusMessage)}</p>` : ""}<form class="community-form" id="community-form"><div class="composer-top"><span class="user-avatar">${escapeHtml(initials(currentProfile.full_name))}</span><div><strong>${escapeHtml(currentProfile.full_name)}</strong><small>${escapeHtml(currentProfile.batch?.name || "Batch assign hone ka intezar")}</small></div></div>${adminBatchPicker}<label class="field-label" for="post-text">Aap kya share karna chahenge?</label><textarea id="post-text" name="post" maxlength="500" placeholder="Koi sawal, padhai ka tip ya progress share karein..."></textarea><div class="composer-bottom"><div class="composer-tools"><label class="photo-upload" for="post-image">▧ Photo jodein</label><input id="post-image" name="image" type="file" accept="image/jpeg,image/png,image/webp"><span class="community-hint" id="post-image-name">Text ya photo · max 8 MB</span></div><button class="button button-primary button-small" type="submit" ${currentProfile.batch_id || adminMode ? "" : "disabled"}>Post karein ↗</button></div></form>${rows}`;
}

function renderProfile(profile, avatarUrl) {
  const profileDescription = adminMode
    ? "Apna admin naam aur profile photo badlein. Google login email surakshit aur read-only rahega."
    : "Apna naam aur phone update karein; email Google account se securely linked hai.";
  return `${heading("AAPKA ACCOUNT", "Profile", profileDescription)}<article class="profile-card"><div class="profile-avatar">${avatarUrl ? `<img src="${escapeHtml(avatarUrl)}" alt="Aapki profile photo">` : escapeHtml(initials(profile.full_name))}</div><div class="profile-details"><h3>${escapeHtml(profile.full_name)}</h3><p>${adminMode ? "DS CLASSES administrator" : "DS CLASSES student"}</p><span class="profile-tag">${escapeHtml(profile.batch?.name || (adminMode ? "Admin account" : "Batch abhi assign nahi"))}</span><form class="avatar-form" id="avatar-form"><label class="photo-upload" for="avatar-file">Profile picture chunein</label><input id="avatar-file" name="file" type="file" accept="image/jpeg,image/png,image/webp" aria-label="Profile picture file" required><span class="community-hint" id="avatar-file-name">JPG, PNG ya WebP · max 5 MB</span><button class="button button-secondary button-small" type="submit">Photo save karein</button></form></div><div class="profile-fields"><div class="profile-field"><small>Email</small><strong>${escapeHtml(profile.email || "Email linked nahi hai")}</strong></div><div class="profile-field"><small>Assigned batch</small><strong>${escapeHtml(profile.batch?.name || "—")}</strong></div></div></article><section class="admin-section profile-edit"><h3>${adminMode ? "Admin profile details" : "Profile details"}</h3><form id="profile-form" class="admin-form"><label>Full name<input name="full_name" value="${escapeHtml(profile.full_name)}" maxlength="120" autocomplete="name" required></label><label>Phone<input name="phone" type="tel" value="${escapeHtml(profile.phone || "")}" maxlength="40" autocomplete="tel"></label><button class="button button-primary button-small" type="submit">Naam aur phone save karein</button></form></section>${adminMode ? `<section class="admin-section"><h3>Admin tools</h3><p class="community-hint">Student app ke Home, Classes, Notes aur Community bhi aapke liye available hain.</p><button class="button button-primary" type="button" data-view="admin">Admin Dashboard kholein</button></section>` : ""}<div class="admin-actions"><button class="button button-secondary" type="button" data-action="sign-out">Logout</button></div>`;
}

function adminPanelMarkup(batches, students, liveSessions, options = {}) {
  const activeBatches = batches.filter((batch) => batch.is_active);
  const batchMenu = batchOptions(activeBatches, false);
  const batchRows = batches.map((batch) => `<form class="batch-edit-form batch-control-row" data-id="${escapeHtml(batch.id)}"><input name="name" value="${escapeHtml(batch.name)}" maxlength="100" aria-label="Batch name" required><input name="class_name" value="${escapeHtml(batch.class_name)}" maxlength="80" aria-label="Class name" required><span>${batch.is_active ? "Active" : "Archived"}</span><button class="button button-secondary button-small" type="submit" ${batch.is_active ? "" : "disabled"}>Save</button>${batch.is_active ? `<button class="button button-danger button-small" data-action="archive-batch" data-id="${escapeHtml(batch.id)}" type="button">Delete</button>` : ""}</form>`).join("");
  const studentRows = students.map((student) => {
    const verification = student.email_verified === null
      ? "Run admin migration"
      : student.email_verified ? "Verified" : "Not verified";
    const accountState = student.is_active === null
      ? "Migration required"
      : student.is_active ? "Active" : "Inactive";
    const accountActions = options.adminFunctionsAvailable
      ? `<button class="button button-secondary button-small" data-action="toggle-student" data-id="${escapeHtml(student.id)}" data-active="${student.is_active}" data-name="${escapeHtml(student.full_name)}" type="button">${student.is_active ? "Deactivate" : "Reactivate"}</button><button class="button button-danger button-small" data-action="delete-student" data-id="${escapeHtml(student.id)}" data-name="${escapeHtml(student.full_name)}" type="button">Delete</button>`
      : `<button class="button button-secondary button-small" type="button" disabled title="Supabase schema migration pehle apply karein">Account actions unavailable</button>`;
    return `<tr data-student-row data-search="${escapeHtml(`${student.full_name} ${student.email || ""} ${student.phone || ""}`.toLowerCase())}"><td><form class="student-edit-form" data-id="${escapeHtml(student.id)}"><label class="sr-only" for="student-name-${escapeHtml(student.id)}">Student name</label><input id="student-name-${escapeHtml(student.id)}" name="full_name" value="${escapeHtml(student.full_name)}" maxlength="120" required><label class="sr-only" for="student-phone-${escapeHtml(student.id)}">Phone</label><input id="student-phone-${escapeHtml(student.id)}" name="phone" value="${escapeHtml(student.phone || "")}" maxlength="40"><label class="sr-only" for="student-address-${escapeHtml(student.id)}">Address</label><input id="student-address-${escapeHtml(student.id)}" name="address" value="${escapeHtml(student.address || "")}" maxlength="500"><label class="sr-only" for="student-batch-${escapeHtml(student.id)}">Batch</label><select id="student-batch-${escapeHtml(student.id)}" name="batch_id"><option value="">No batch</option>${activeBatches.map((batch) => `<option value="${escapeHtml(batch.id)}" ${student.batch_id === batch.id ? "selected" : ""}>${escapeHtml(batch.name)} · ${escapeHtml(batch.class_name)}</option>`).join("")}</select><button class="button button-secondary button-small" type="submit">Save</button></form></td><td>${escapeHtml(student.email || "—")}<small class="verification-badge">${verification}</small></td><td>${formatDate(student.created_at)}</td><td><span class="profile-tag">${accountState}</span><div class="admin-actions">${accountActions}</div></td></tr>`;
  }).join("");
  const sessionRows = liveSessions.map((session) => `<article class="notice-card"><span class="notice-icon">▶</span><div><h4>${escapeHtml(session.title)} · ${escapeHtml(session.batch?.name || "Batch unavailable")}</h4><p>${escapeHtml(session.subject)} · ${escapeHtml(session.status)} · ${formatDate(session.starts_at)}</p><form class="session-links-form admin-form" data-session-id="${escapeHtml(session.id)}"><label>Class HTTPS link<input name="stream_url" type="url" value="${escapeHtml(session.stream_url || "")}" placeholder="https://..."></label><label>Recording HTTPS link<input name="recording_url" type="url" value="${escapeHtml(session.recording_url || "")}" placeholder="https://..."></label><button class="button button-secondary button-small" type="submit">Links save karein</button></form><div class="admin-actions">${session.status === "live" ? `<button class="button button-danger button-small" data-action="end-live" data-id="${escapeHtml(session.id)}" type="button">Live class stop karein</button>` : ""}</div></div></article>`).join("");
  const migrationNotice = options.migrationRequired
    ? `<div class="empty-state" role="status">Admin features ka Supabase SQL migration abhi apply nahi hai. Batch, notice, notes, live-class aur profile-based assignment manage kiye ja sakte hain; verified email aur account deactivate/delete ke liye Supabase SQL Editor mein supabase/schema.sql chalayein.</div>`
    : "";
  return `${heading("ADMIN DASHBOARD", `Namaste, ${currentProfile.full_name}`, "Batch Control aur Student Details ko manage karein.")}${migrationNotice}<div class="admin-preview"><article class="admin-card"><small>Registered students</small><strong>${students.length}</strong></article><article class="admin-card"><small>Active batches</small><strong>${activeBatches.length}</strong></article><article class="admin-card"><small>Live classes</small><strong>${liveSessions.filter((session) => session.status === "live").length}</strong></article></div><section class="admin-section admin-control-box"><h3>Batch Control</h3><div class="admin-management"><form class="admin-form" id="batch-form"><label>Batch name<input name="name" maxlength="100" placeholder="Class 10 - 2026" required></label><label>Class<input name="class_name" maxlength="80" placeholder="Class 10" required></label><button class="button button-primary button-small" type="submit">Batch create karein</button></form><form class="admin-form" id="notice-form"><label>Batch<select name="batch_id" required>${batchMenu}</select></label><label>Notice title<input name="title" maxlength="160" required></label><label>Notice message<textarea name="body" maxlength="5000" required></textarea></label><button class="button button-primary button-small" type="submit">Notice publish karein</button></form><form class="admin-form" id="note-form"><label>Batch<select name="batch_id" required>${batchMenu}</select></label><label>Subject<input name="subject" maxlength="100" required></label><label>Notes name<input name="title" maxlength="160" required></label><label>PDF file<input name="file" type="file" accept="application/pdf" required></label><button class="button button-primary button-small" type="submit">PDF upload karein</button></form><form class="admin-form" id="live-form"><label>Batch<select name="batch_id" required>${batchOptions(activeBatches, false)}</select></label><label>Subject<input name="subject" maxlength="100" required></label><label>Class name<input name="title" maxlength="160" required></label><label>Students' HTTPS viewer link<input name="stream_url" type="url" placeholder="https://..." required></label><label>Recording link<input name="recording_url" type="url" placeholder="https://..."></label><button class="button button-primary button-small" type="submit">Live class start karein</button></form></div><div class="admin-section"><h4>Batch create/edit/delete</h4><div class="batch-control-list">${batchRows || emptyState("Abhi koi batch nahi hai.")}</div></div><div class="section-row"><h4>Live classes aur links</h4></div>${sessionRows || emptyState("Abhi koi live session nahi hai.")}</section><section class="admin-section student-details-box"><h3>Student Details</h3><label class="student-search-label">Search students<input id="student-search" type="search" placeholder="Name, email ya phone se search karein"></label><div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>Student details / batch</th><th>Verified email</th><th>Registration date</th><th>Account controls</th></tr></thead><tbody>${studentRows || `<tr><td colspan="4">Abhi koi student registered nahi hai.</td></tr>`}</tbody></table></div></section>`;
}

function renderInbox(threads, selectedThread, messages, students = []) {
  const selectedId = selectedThread?.id || "";
  const threadList = threads.length
    ? threads.map((thread) => {
      const studentName = students.find((student) => student.id === thread.student_id)?.full_name;
      return `<button type="button" class="inbox-thread-button ${thread.id === selectedId ? "active" : ""}" data-action="select-thread" data-id="${escapeHtml(thread.id)}"><strong>${escapeHtml(studentName || thread.subject)}</strong><span>${escapeHtml(thread.subject)}</span><small>${formatDate(thread.updated_at)}</small></button>`;
    }).join("")
    : emptyState("Abhi koi conversation nahi hai.");
  const newThread = !adminMode
    ? `<form class="admin-form inbox-new-form" id="new-thread-form"><h3>Naya doubt / message</h3><label>Subject<input name="subject" maxlength="160" required></label><label>Message<textarea name="body" maxlength="5000" required></textarea></label><button class="button button-primary button-small" type="submit">Admin ko bhejein</button></form>`
    : "";
  const selectedStudentName = students.find((student) => student.id === selectedThread?.student_id)?.full_name;
  const conversation = selectedThread
    ? `<section class="inbox-conversation"><div class="section-row"><h3>${escapeHtml(selectedThread.subject)}</h3><small>${adminMode ? escapeHtml(selectedStudentName || "Student") : "DS CLASSES Admin"}</small></div><div class="inbox-message-list">${messages.map((item) => `<article class="inbox-message ${item.sender_id === currentUser.id ? "mine" : ""}"><strong>${escapeHtml(item.sender_id === currentUser.id ? "Aap" : (adminMode ? selectedStudentName || "Student" : "DS CLASSES Admin"))}</strong><p>${escapeHtml(item.body)}</p><small>${formatDate(item.created_at)}</small></article>`).join("") || emptyState("Abhi koi message nahi hai.")}</div><form class="admin-form inbox-reply-form" id="inbox-reply-form" data-thread-id="${escapeHtml(selectedThread.id)}"><label>Reply<textarea name="body" maxlength="5000" required></textarea></label><button class="button button-primary button-small" type="submit">Message bhejein</button></form></section>`
    : emptyState(adminMode ? "Reply karne ke liye student conversation chunein." : "Conversation chunein ya admin ko naya message bhejein.");
  return `${heading("PRIVATE STUDENT-ADMIN MESSAGES", "Inbox", "Doubts aur replies sirf aap aur DS CLASSES admin ke beech dikhte hain.")}<div class="inbox-layout"><aside class="inbox-sidebar"><h3>${adminMode ? "Student conversations" : "Aapke messages"}</h3>${threadList}${newThread}</aside>${conversation}</div>`;
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

async function updateInboxCount(userId) {
  try {
    const { count, error } = await supabase
      .from("inbox_messages")
      .select("id", { count: "exact", head: true })
      .neq("sender_id", userId)
      .is("read_at", null);
    if (error) throw error;
    if (currentUser?.id !== userId) return;
    document.querySelectorAll("#desktop-inbox-count").forEach((badge) => {
      badge.textContent = count ? String(count) : "";
      badge.classList.toggle("hidden", !count);
    });
    document.querySelector("#topbar-inbox-dot").classList.toggle("hidden", !count);
  } catch (error) {
    console.warn("Inbox unread count could not be loaded:", error.message);
  }
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
  currentInboxThreadId = null;
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
  adminStudentFunctionsAvailable = true;
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
  if (view !== "inbox" && inboxChannel) {
    await supabase.removeChannel(inboxChannel);
    inboxChannel = null;
  }
  void updateInboxCount(currentUser.id);
  pageContent.innerHTML = `<div class="empty-state">Data load ho raha hai…</div>`;
  try {
    if (view === "admin" && adminMode) {
      const [batchesResult, studentsResult, liveResult] = await Promise.all([
        supabase.from("batches").select("*").order("name"),
        supabase.rpc("admin_list_students"),
        supabase.from("live_sessions").select("*,batches(name)").order("starts_at", { ascending: false }),
      ]);
      if (batchesResult.error) throw batchesResult.error;
      if (liveResult.error) throw liveResult.error;
      let students = studentsResult.data;
      let migrationRequired = false;
      if (studentsResult.error) {
        if (!rpcUnavailable(studentsResult.error)) throw studentsResult.error;
        adminStudentFunctionsAvailable = false;
        migrationRequired = true;
        const profilesResult = await supabase
          .from("profiles")
          .select("id,full_name,email,phone,address,batch_id,created_at")
          .order("created_at", { ascending: false });
        if (profilesResult.error) throw profilesResult.error;
        students = profilesResult.data.map((student) => ({
          ...student,
          email_verified: null,
          is_active: null,
        }));
      } else {
        adminStudentFunctionsAvailable = true;
      }
      const liveSessions = liveResult.data.map((session) => ({ ...session, batch: session.batches }));
      pageContent.innerHTML = adminPanelMarkup(batchesResult.data, students, liveSessions, {
        adminFunctionsAvailable: adminStudentFunctionsAvailable,
        migrationRequired,
      });
      return;
    }
    if (view === "admin") {
      currentView = "profile";
      render();
      await loadView();
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
      const messagesBySession = new Map();
      for (const chatMessage of chatResult.data) {
        const messages = messagesBySession.get(chatMessage.session_id) || [];
        messages.push(chatMessage);
        messagesBySession.set(chatMessage.session_id, messages);
      }
      if (view === currentView) pageContent.innerHTML = `${heading("PADHAI KA SAMAY", "Classes", "Live sessions aur class recordings.")}<div class="section-row"><h3>Live session</h3></div>${live.length ? live.map((session) => renderLiveCard(session, messagesBySession.get(session.id) || [])).join("") : emptyState("Abhi koi class live nahi hai.")}<div class="section-row"><h3>Scheduled classes aur recordings</h3></div>${archived.length ? archived.map((session) => renderLiveCard(session)).join("") : emptyState("Abhi koi recording nahi hai.")}`;
    } else if (view === "community") {
      const { data, error } = await supabase.from("community_posts").select("*").order("created_at", { ascending: false }).limit(50);
      if (error) throw error;
      const [commentsResult, batchesResult] = await Promise.all([
        data.length
          ? supabase.from("community_comments").select("*").in("post_id", data.map((post) => post.id)).order("created_at", { ascending: true })
          : Promise.resolve({ data: [], error: null }),
        adminMode ? supabase.from("batches").select("id,name,class_name").eq("is_active", true).order("name") : Promise.resolve({ data: [], error: null }),
      ]);
      if (batchesResult.error) throw batchesResult.error;
      if (commentsResult.error) console.error("Community comments could not be loaded:", commentsResult.error.message);
      const commentsByPost = new Map();
      for (const comment of commentsResult.data || []) {
        const comments = commentsByPost.get(comment.post_id) || [];
        comments.push(comment);
        commentsByPost.set(comment.post_id, comments);
      }
      const postsWithImages = await Promise.all(data.map(async (post) => {
        const [imageResult, avatarResult] = await Promise.all([
          post.image_path ? supabase.storage.from("community-images").createSignedUrl(post.image_path, 300) : Promise.resolve({ data: null, error: null }),
          post.author_avatar_path ? supabase.storage.from("student-avatars").createSignedUrl(post.author_avatar_path, 300) : Promise.resolve({ data: null, error: null }),
        ]);
        if (imageResult.error) throw imageResult.error;
        if (avatarResult.error) throw avatarResult.error;
        return {
          ...post,
          comments: commentsByPost.get(post.id) || [],
          image_url: imageResult.data?.signedUrl,
          avatar_url: avatarResult.data?.signedUrl,
        };
      }));
      if (view === currentView) {
        const commentStatus = commentsResult.error
          ? "Comments unavailable. Supabase migration aur community_comments policies check karein."
          : "";
        pageContent.innerHTML = renderCommunity(renderPosts(postsWithImages, !commentsResult.error), batchesResult.data, commentStatus);
      }
    } else if (view === "inbox") {
      const { data: threads, error: threadsError } = await supabase.from("inbox_threads").select("*").order("updated_at", { ascending: false });
      if (threadsError) throw threadsError;
      const selectedThread = threads.find((thread) => thread.id === currentInboxThreadId) || threads[0] || null;
      currentInboxThreadId = selectedThread?.id || null;
      const [studentsResult, messagesResult] = await Promise.all([
        adminMode ? supabase.rpc("admin_list_students") : Promise.resolve({ data: [], error: null }),
        selectedThread
          ? supabase.from("inbox_messages").select("*").eq("thread_id", selectedThread.id).order("created_at", { ascending: true })
          : Promise.resolve({ data: [], error: null }),
      ]);
      if (studentsResult.error) throw studentsResult.error;
      if (messagesResult.error) throw messagesResult.error;
      const messages = messagesResult.data;
      const unreadIds = messages.filter((item) => item.sender_id !== currentUser.id && !item.read_at).map((item) => item.id);
      if (unreadIds.length) {
        const { error: readError } = await supabase.from("inbox_messages").update({ read_at: new Date().toISOString() }).in("id", unreadIds);
        if (readError) throw readError;
        void updateInboxCount(currentUser.id);
      }
      if (view === currentView) {
        pageContent.innerHTML = renderInbox(threads, selectedThread, messages, studentsResult.data);
        try {
          if (!inboxChannel) {
            inboxChannel = supabase
              .channel(`ds-classes-inbox-${currentUser.id}`)
              .on("postgres_changes", { event: "INSERT", schema: "public", table: "inbox_messages" }, () => {
                if (currentView === "inbox") void loadView();
              })
              .subscribe();
          }
        } catch (realtimeError) {
          console.warn("Inbox realtime updates unavailable:", realtimeError.message);
        }
      }
    } else if (view === "profile") {
      const profile = await getProfile(currentUser);
      currentProfile = profile;
      const avatarResult = profile.avatar_path
        ? await supabase.storage.from("student-avatars").createSignedUrl(profile.avatar_path, 300)
        : { data: null, error: null };
      if (avatarResult.error) throw avatarResult.error;
      if (view === currentView) {
        const avatarButton = document.querySelector(".avatar-button");
        avatarButton.innerHTML = avatarResult.data?.signedUrl
          ? `<img src="${escapeHtml(avatarResult.data.signedUrl)}" alt="">`
          : escapeHtml(initials(profile.full_name));
        avatarButton.setAttribute("aria-label", `${profile.full_name} profile`);
        pageContent.innerHTML = renderProfile(profile, avatarResult.data?.signedUrl);
      }
    }
  } catch (error) {
    if (view === currentView) {
      const helpText = view === "inbox"
        ? "Inbox ke liye Supabase schema migration aur RLS policies lagu honi chahiye."
        : "Backend request fail hui. Supabase setup aur access policies check karein.";
      pageContent.innerHTML = `${heading("DS CLASSES", "Data load nahi hua")}<div class="empty-state">${escapeHtml(error.message || helpText)}<p>${escapeHtml(helpText)}</p></div>`;
    }
  }
}

function render() {
  document.querySelectorAll("[data-view]").forEach((button) => {
    button.classList.toggle("active", button.dataset.view === currentView);
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
  } else if (form.classList.contains("batch-edit-form")) {
    const { error } = await supabase.from("batches").update({
      name: values.name.trim(),
      class_name: values.class_name.trim(),
    }).eq("id", form.dataset.id);
    if (error) throw error;
  } else if (form.id === "profile-form") {
    const fullName = values.full_name.trim();
    if (!fullName) throw new Error("Naam khaali nahi ho sakta.");
    const { error } = await supabase.from("profiles").update({
      full_name: fullName,
      phone: values.phone.trim(),
    }).eq("id", currentUser.id);
    if (error) throw error;
    currentProfile = await getProfile(currentUser);
  } else if (form.classList.contains("student-edit-form")) {
    if (adminStudentFunctionsAvailable) {
      const { error } = await supabase.rpc("admin_update_student", {
        target_student_id: form.dataset.id,
        new_full_name: values.full_name.trim(),
        new_phone: values.phone.trim(),
        new_address: values.address.trim(),
        new_batch_id: values.batch_id || null,
      });
      if (error && !rpcUnavailable(error)) throw error;
      if (rpcUnavailable(error)) adminStudentFunctionsAvailable = false;
    }
    if (!adminStudentFunctionsAvailable) {
      const { data, error } = await supabase
        .from("profiles")
        .update({
          full_name: values.full_name.trim(),
          phone: values.phone.trim(),
          address: values.address.trim(),
          batch_id: values.batch_id || null,
        })
        .eq("id", form.dataset.id)
        .select("id")
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("Student update nahi hua. Admin role aur profiles ki RLS policy check karein.");
    }
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
  } else if (form.classList.contains("session-links-form")) {
    const streamUrl = values.stream_url ? new URL(values.stream_url) : null;
    const recordingUrl = values.recording_url ? new URL(values.recording_url) : null;
    if (streamUrl && streamUrl.protocol !== "https:") throw new Error("Class link HTTPS hona chahiye.");
    if (recordingUrl && recordingUrl.protocol !== "https:") throw new Error("Recording link HTTPS hona chahiye.");
    const { error } = await supabase.from("live_sessions").update({
      stream_url: streamUrl?.href || null,
      recording_url: recordingUrl?.href || null,
    }).eq("id", form.dataset.sessionId);
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
    batch_id: form.elements.batch_id?.value || currentProfile.batch_id,
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

async function submitCommunityComment(form) {
  const body = form.elements.body.value.trim();
  if (!body) throw new Error("Comment likhein.");
  const { error } = await supabase.from("community_comments").insert({
    post_id: form.dataset.postId,
    author_id: currentUser.id,
    author_name: currentProfile.full_name,
    body,
  });
  if (error) throw error;
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

async function submitInboxForm(form) {
  const values = formValues(form);
  if (form.id === "new-thread-form") {
    const { data, error } = await supabase.rpc("start_inbox_thread", {
      thread_subject: values.subject.trim(),
      first_message: values.body.trim(),
    });
    if (error) throw error;
    currentInboxThreadId = data;
  } else if (form.classList.contains("inbox-reply-form")) {
    const body = values.body.trim();
    if (!body) throw new Error("Message likhein.");
    const { error } = await supabase.from("inbox_messages").insert({
      thread_id: form.dataset.threadId,
      sender_id: currentUser.id,
      body,
    });
    if (error) throw error;
    currentInboxThreadId = form.dataset.threadId;
  }
  await loadView();
}

async function handleAdminAction(button) {
  const id = button.dataset.id;
  if (button.dataset.action === "archive-batch") {
    const batchName = button.closest(".batch-control-row").elements.name.value;
    if (!window.confirm(`"${batchName}" batch ko archive karein? Isse existing study data delete nahi hoga.`)) return;
    const { error } = await supabase.from("batches").update({ is_active: false }).eq("id", id);
    if (error) throw error;
  } else if (button.dataset.action === "toggle-student") {
    const makingActive = button.dataset.active !== "true";
    const verb = makingActive ? "reactivate" : "deactivate";
    if (!window.confirm(`${button.dataset.name || "Is student"} ko ${verb} karein?`)) return;
    const { error } = await supabase.rpc("admin_set_student_active", {
      target_student_id: id,
      make_active: makingActive,
    });
    if (rpcUnavailable(error)) {
      adminStudentFunctionsAvailable = false;
      throw new Error("Student deactivate/reactivate ke liye Supabase admin migration pehle apply karein.");
    }
    if (error) throw error;
  } else if (button.dataset.action === "delete-student") {
    const name = button.dataset.name || "Student";
    if (!window.confirm(`${name} ka account permanently delete hoga. Is student ke profile, community posts/comments aur inbox bhi delete ho sakte hain. Yeh undo nahi hoga. Jaari rakhein?`)) return;
    const { error } = await supabase.rpc("admin_delete_student", { target_student_id: id });
    if (rpcUnavailable(error)) {
      adminStudentFunctionsAvailable = false;
      throw new Error("Student account delete ke liye Supabase admin migration pehle apply karein.");
    }
    if (error) throw error;
  } else if (button.dataset.action === "end-live") {
    if (!window.confirm("Live class stop karein?")) return;
    const { error } = await supabase.from("live_sessions").update({
      status: "ended",
      ended_at: new Date().toISOString(),
    }).eq("id", id);
    if (error) throw error;
  } else {
    return;
  }
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
  if (supabase && inboxChannel) {
    await supabase.removeChannel(inboxChannel);
    inboxChannel = null;
  }
  currentUser = null;
  currentProfile = null;
  adminMode = false;
  setDashboardVisible(false);
}

app.addEventListener("click", async (event) => {
  const viewLink = event.target.closest("[data-view]");
  if (viewLink) {
    event.preventDefault();
    const nextView = viewLink.dataset.view;
    if (!supportedViews.has(nextView) || (nextView === "admin" && !adminMode)) return;
    currentView = nextView;
    render();
    if (supabase && currentUser) await loadView();
    window.scrollTo(0, 0);
    return;
  }
  const button = event.target.closest("button, [data-action='open-note']");
  if (!button) return;
  if (button.dataset.action === "sign-out") {
    await leaveDashboard();
    return;
  }
  if (button.dataset.action === "select-thread") {
    currentInboxThreadId = button.dataset.id;
    await loadView();
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
  if (["archive-batch", "toggle-student", "delete-student", "end-live"].includes(button.dataset.action) && supabase) {
    try {
      await handleAdminAction(button);
    } catch (error) {
      alert(error.message || "Admin action poori nahi hui.");
    }
  }
});

app.addEventListener("change", async (event) => {
  if (event.target.id === "post-image") {
    document.querySelector("#post-image-name").textContent = event.target.files[0]?.name || "Text ya photo · max 8 MB";
  }
  if (event.target.id === "avatar-file") {
    document.querySelector("#avatar-file-name").textContent = event.target.files[0]?.name || "JPG, PNG ya WebP · max 5 MB";
  }
});

app.addEventListener("submit", async (event) => {
  const form = event.target;
  if (form.matches("form") && (["batch-form", "notice-form", "note-form", "live-form", "community-form", "avatar-form", "profile-form", "new-thread-form"].includes(form.id) || form.classList.contains("live-chat-form") || form.classList.contains("community-comment-form") || form.classList.contains("recording-form") || form.classList.contains("batch-edit-form") || form.classList.contains("student-edit-form") || form.classList.contains("session-links-form") || form.classList.contains("inbox-reply-form"))) {
    event.preventDefault();
    const submit = form.querySelector("[type='submit']");
    submit.disabled = true;
    try {
      if (form.id === "community-form") await submitCommunityPost(form);
      else if (form.classList.contains("community-comment-form")) await submitCommunityComment(form);
      else if (form.classList.contains("live-chat-form")) await submitLiveComment(form);
      else if (form.id === "new-thread-form" || form.classList.contains("inbox-reply-form")) await submitInboxForm(form);
      else await submitDataForm(form);
    } catch (error) {
      alert(error.message || "Request poori nahi hui.");
    } finally {
      if (submit) submit.disabled = false;
    }
  }
});

app.addEventListener("input", (event) => {
  if (event.target.id !== "student-search") return;
  const query = event.target.value.trim().toLowerCase();
  document.querySelectorAll("[data-student-row]").forEach((row) => {
    row.classList.toggle("hidden", !row.dataset.search.includes(query));
  });
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
