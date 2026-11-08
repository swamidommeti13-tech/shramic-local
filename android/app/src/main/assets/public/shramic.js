const API_URL = localStorage.getItem("shramic_api_url") || window.location.origin;

function tomorrow() {
const date = new Date();
date.setDate(date.getDate() + 1);
return localDateString(date);
}

function localDateString(date) {
const year = date.getFullYear();
const month = String(date.getMonth() + 1).padStart(2, "0");
const day = String(date.getDate()).padStart(2, "0");
return `${year}-${month}-${day}`;
}

let state = {
    jobs: [],
    payments: [],
    profile: {
        worker: { name: "", location: "", skill: "" },
        contractor: { name: "", location: "", skill: "" }
    }
};
let currentRole = "worker";
let currentUser = null;
let toastTimer;

async function apiRequest(path, options = {}) {
const token = localStorage.getItem("shramic_token");
const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers
    }
});

const data = await response.json().catch(() => ({}));
if (response.status === 401) {
    localStorage.removeItem("shramic_token");
    localStorage.removeItem("shramic_user");
    window.location.href = "login.html";
    throw new Error("Your session has expired. Please log in again.");
}
if (!response.ok) throw new Error(data.error || "The request could not be completed.");
return data;
}

async function loadServerState() {
const [user, jobs, applications, payments] = await Promise.all([
    apiRequest("/api/me"),
    apiRequest("/api/jobs"),
    apiRequest("/api/applications"),
    apiRequest("/api/payments")
]);

currentUser = user;
currentRole = user.role;
state.profile[currentRole] = {
    id: user.id,
    name: user.name,
    location: user.location || "",
    skill: user.skill || ""
};

const applicantsByJob = new Map();
applications.forEach(application => {
    const entry = {
        id: application.id,
        workerId: application.worker_id,
        name: application.worker_name || user.name,
        status: application.status,
        appliedAt: application.applied_at
    };
    const list = applicantsByJob.get(application.job_id) || [];
    list.push(entry);
    applicantsByJob.set(application.job_id, list);
});

state.jobs = jobs.map(job => ({
    id: job.id,
    title: job.title,
    location: job.location,
    wage: Number(job.wage),
    workers: Number(job.workers),
    date: job.date,
    contractor: job.contractor_name || "Local Contractor",
    contractorId: job.contractor_id,
    description: job.description || "",
    applicants: applicantsByJob.get(job.id) || [],
    status: job.status,
    payments: []
}));
state.payments = payments.map(payment => ({
    jobId: payment.job_id,
    jobTitle: payment.job_title,
    worker: payment.worker_name || user.name,
    workerId: payment.worker_id,
    contractor: payment.contractor_name || user.name,
    amount: Number(payment.amount),
    recordedAt: payment.recorded_at
}));

const roleSelect = document.getElementById("roleSelect");
roleSelect.value = currentRole;
roleSelect.disabled = true;
document.getElementById("welcomeLabel").textContent = tr("WELCOME TO SHRAMIC LOCAL");
refresh();
}

function currentProfile() {
return state.profile[currentRole];
}

function formatDate(date) {
if (!date) return "Not specified";

const parsed = new Date(date + "T00:00:00");

if (Number.isNaN(parsed.getTime())) return date;

return parsed.toLocaleDateString(
    window.getShramicLanguage?.() === "te" ? "te-IN" : "en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric"
    });

}

function escapeHTML(value) {
return String(value ?? "").replace(/[&<>"']/g, char => ({
"&": "&amp;",
"<": "&lt;",
">": "&gt;",
'"': "&quot;",
"'": "&#39;"
})[char]);
}

function showToast(message) {
const toast = document.getElementById("toast");

toast.textContent = tr(message);
toast.classList.add("show");

clearTimeout(toastTimer);

toastTimer = setTimeout(() => {
    toast.classList.remove("show");
}, 2800);

}

function showPage(pageId, button) {
document.querySelectorAll(".page").forEach(page => {
page.classList.add("hidden");
});

const page = document.getElementById(pageId);
if (page) page.classList.remove("hidden");

document.querySelectorAll(".nav-btn").forEach(nav => {
    nav.classList.remove("active");
});

if (button) button.classList.add("active");

const titles = {
    dashboard: "Dashboard",
    jobs: "Find Jobs",
    applications: currentRole === "worker"
        ? "My Applications" : "Manage Applications",
    payments: "Payment Records",
    profile: "My Profile"
};

document.getElementById("pageTitle").textContent =
    tr(titles[pageId] || "Shramic Local");

refresh();

}

function switchRole() {
document.getElementById("roleSelect").value = currentUser?.role || currentRole;
showToast("Your dashboard role is set by your registered account.");
}

function myApplications() {
return state.jobs.flatMap(job =>
    job.applicants
        .filter(app => app.workerId === currentUser?.id)
        .map(app => ({ job, app }))
);
}

function contractorJobs() {
return state.jobs.filter(job => job.contractorId === currentUser?.id);
}

function relevantJobs() {
if (currentRole === "contractor") {
return contractorJobs();
}

return state.jobs.filter(job => job.status === "open");

}

function refresh() {
renderDashboard();
renderJobs();
renderApplications();
renderPayments();
renderProfile();
}

window.onLanguageChanged = function () {
    refresh();
    const page = document.querySelector(".page:not(.hidden)");
    if (page) {
        const pageId = page.id;
        const titles = {
            dashboard: "Dashboard",
            jobs: "Find Jobs",
            applications: currentRole === "worker" ? "My Applications" : "Manage Applications",
            payments: "Payment Records",
            profile: "My Profile"
        };
        document.getElementById("pageTitle").textContent = tr(titles[pageId] || "Shramic Local");
    }
};

function renderDashboard() {
const profile = currentProfile();
const jobs = relevantJobs();

document.getElementById("welcomeTitle").textContent =
    `${tr("Hello,")} ${profile.name}! 👋`;

document.getElementById("welcomeText").textContent =
    currentRole === "worker"
        ? tr("Find nearby jobs and earn with your skills.")
        : tr("Post local jobs and connect with available workers.");

document.getElementById("availableCount").textContent =
    currentRole === "worker"
        ? state.jobs.filter(job => job.status === "open").length
        : contractorJobs().length;

document.getElementById("applicationCount").textContent =
    currentRole === "worker"
        ? myApplications().length
        : contractorJobs().reduce(
            (total, job) => total + job.applicants.length, 0
        );

const myPayments = state.payments.filter(payment =>
    currentRole === "worker"
        ? payment.workerId === currentUser?.id
        : contractorJobs().some(job => job.id === payment.jobId)
);

const amount = myPayments.reduce(
    (total, payment) => total + payment.amount, 0
);

document.getElementById("earningsLabel").textContent =
    tr(currentRole === "worker" ? "Recorded Earnings" : "Recorded Payments");

document.getElementById("earningsCount").textContent =
    "₹" + amount.toLocaleString("en-IN");

document.getElementById("featuredTitle").textContent =
    tr(currentRole === "worker" ? "Recommended Jobs" : "Your Posted Jobs");

document.getElementById("postJobBtn").classList.toggle(
    "hidden", currentRole !== "contractor"
);

document.getElementById("jobsPostBtn").classList.toggle(
    "hidden", currentRole !== "contractor"
);

const featured = document.getElementById("featuredJobs");

featured.innerHTML = jobs.length
    ? jobs.slice(0, 4).map(job => jobCard(job)).join("")
    : `<div class="empty-state">${tr("No jobs found. Post a job to get started.")}</div>`;

}

function jobCard(job) {
const applied = job.applicants.some(app =>
app.workerId === currentUser?.id
);

const applicantCount = job.applicants.length;

const actions = currentRole === "worker"
    ? `<button class="primary-btn"
                onclick="applyForJob(${job.id})"
                ${applied || job.status !== "open" ? "disabled" : ""}>
            ${tr(applied ? "✓ Applied" : "Apply for Job")}
       </button>`
    : `<button class="secondary-btn"
                onclick="viewApplicants(${job.id})">
            ${tr("Applicants")} (${applicantCount})
       </button>
       <button class="secondary-btn"
               onclick="completeJob(${job.id})"
               ${job.status === "completed" ? "disabled" : ""}>
            ${tr(job.status === "completed" ? "✓ Completed" : "Complete Job")}
       </button>`;

return `
    <article class="job-card">
        <h3 data-no-translate>${escapeHTML(job.title)}</h3>
        <p class="job-contractor">
            ${tr("Posted by")} <span data-no-translate>${escapeHTML(job.contractor)}</span>
        </p>

        <p class="job-wage">
            ₹${job.wage.toLocaleString("en-IN")}
            <small style="font-size:12px;font-weight:normal">
                ${tr("/ day")}
            </small>
        </p>

        <div class="job-meta">
            <span class="badge">📍 <span data-no-translate>${escapeHTML(job.location)}</span></span>
            <span class="badge">👷 ${job.workers} ${tr("workers")}</span>
            <span class="badge">📅 ${escapeHTML(formatDate(job.date))}</span>
        </div>

        <p class="job-description">
            <span data-no-translate>${escapeHTML(job.description || tr("No description provided."))}</span>
        </p>

        <div class="job-actions">${actions}</div>
    </article>
`;

}

function renderJobs() {
const container = document.getElementById("allJobs");

const search = document.getElementById("searchInput")
    .value.trim().toLowerCase();

const location = document.getElementById("locationFilter").value;

const jobs = relevantJobs().filter(job => {
    const text = [
        job.title, job.location, job.contractor, job.description
    ].join(" ").toLowerCase();

    return text.includes(search) &&
        (!location || job.location === location);
});

container.innerHTML = jobs.length
    ? jobs.map(job => jobCard(job)).join("")
    : `<div class="empty-state">${tr("No matching jobs found.")}</div>`;

}

function openJobModal() {
if (currentRole !== "contractor") {
showToast("Switch to the contractor dashboard to post jobs.");
return;
}

document.getElementById("jobForm").reset();
document.getElementById("jobDate").value = tomorrow();
document.getElementById("jobModal").classList.remove("hidden");

}

function closeJobModal() {
document.getElementById("jobModal").classList.add("hidden");
}

document.getElementById("jobForm").addEventListener("submit", async event => {
event.preventDefault();

if (currentRole !== "contractor") {
    showToast("Only contractors can post jobs.");
    return;
}

const title = document.getElementById("jobTitle").value.trim();
const location = document.getElementById("jobLocation").value.trim();
const wage = Number(document.getElementById("jobWage").value);
const workers = Number(document.getElementById("jobWorkers").value);
const date = document.getElementById("jobDate").value;
const description =
    document.getElementById("jobDescription").value.trim();

if (!title || !location ||
    !Number.isInteger(wage) || wage < 1 || wage > 100000 ||
    !Number.isInteger(workers) || workers < 1 || workers > 1000 ||
    !date) {
    showToast("Please enter valid job details.");
    return;
}

try {
    await apiRequest("/api/jobs", {
        method: "POST",
        body: JSON.stringify({ title, location, wage, workers, date, description })
    });
    await loadServerState();
    closeJobModal();
    showToast("Job posted successfully!");
} catch (error) {
    showToast(error.message);
}

});

async function applyForJob(jobId) {
if (currentRole !== "worker") {
showToast("Switch to the worker dashboard to apply.");
return;
}

const job = state.jobs.find(item => item.id === jobId);

if (!job || job.status !== "open") {
    showToast("This job is no longer open.");
    return;
}

if (job.applicants.some(app => app.workerId === currentUser?.id)) {
    showToast("You have already applied.");
    return;
}

try {
    await apiRequest(`/api/jobs/${jobId}/apply`, { method: "POST" });
    await loadServerState();
    showToast("Application submitted!");
} catch (error) {
    showToast(error.message);
}

}

async function viewApplicants(jobId) {
if (currentRole !== "contractor") {
showToast("Only contractors can manage applicants.");
return;
}

const job = state.jobs.find(item => item.id === jobId);

if (!job || !contractorJobs().some(item => item.id === jobId)) {
    showToast("You can only manage your own jobs.");
    return;
}

if (!job.applicants.length) {
    showToast("No applications yet.");
    return;
}

const choices = job.applicants.map((app, index) =>
    `${index + 1}. ${app.name} — ${tr(app.status)}`
).join("\n");

const answer = prompt(
    `${tr("Applicants for")} ${job.title}:\n\n${choices}\n\n` +
    tr("Enter the applicant number to select or reject, or Cancel.")
);

if (answer === null) return;

const index = Number(answer) - 1;
const applicant = job.applicants[index];

if (!Number.isInteger(index) || !applicant) {
    showToast("Invalid applicant number.");
    return;
}

const action = prompt(
    `${tr("Enter S to select")} ${applicant.name}`
);

if (!action) return;

let status;
if (action.trim().toLowerCase() === "s") {
    const selectedCount = job.applicants.filter(
        app => app.status === "Selected"
    ).length;

    if (applicant.status !== "Selected" &&
        selectedCount >= job.workers) {
        showToast("You have already selected all required workers.");
        return;
    }

    status = "Selected";
} else if (action.trim().toLowerCase() === "r") {
    status = "Rejected";
} else {
    showToast("Enter S or R.");
    return;
}

try {
    await apiRequest(`/api/applications/${applicant.id}`, {
        method: "PUT",
        body: JSON.stringify({ status })
    });
    await loadServerState();
    showToast("Application updated.");
} catch (error) {
    showToast(error.message);
}

}

async function completeJob(jobId) {
if (currentRole !== "contractor") {
showToast("Only contractors can complete jobs.");
return;
}

const job = state.jobs.find(item => item.id === jobId);

if (!job || !contractorJobs().some(item => item.id === jobId)) {
    showToast("You can only manage your own jobs.");
    return;
}

const selected = job.applicants.filter(
    app => app.status === "Selected"
);

if (!selected.length) {
    showToast("Select workers before completing the job.");
    return;
}

if (job.status === "completed") {
    showToast("This job is already completed.");
    return;
}

if (!confirm("Mark this job as completed?")) return;

try {
    await apiRequest(`/api/jobs/${jobId}/complete`, { method: "POST" });
    await loadServerState();
    showToast("Job marked completed.");
} catch (error) {
    showToast(error.message);
}

}

function renderApplications() {
const table = document.getElementById("applicationsTable");

let rows = [];

if (currentRole === "worker") {
    rows = myApplications().map(({ job, app }) => `
        <tr>
            <td data-no-translate>${escapeHTML(job.title)}</td>
            <td data-no-translate>${escapeHTML(job.location)}</td>
            <td>₹${job.wage.toLocaleString("en-IN")}</td>
            <td>
                <span class="status ${app.status.toLowerCase()}">
                    ${escapeHTML(tr(app.status))}
                </span>
            </td>
            <td data-no-translate>${escapeHTML(job.contractor)}</td>
        </tr>
    `);
} else {
    rows = contractorJobs().flatMap(job =>
        job.applicants.map(app => `
            <tr>
                <td data-no-translate>${escapeHTML(job.title)}</td>
                <td data-no-translate>${escapeHTML(app.name)}</td>
                <td>₹${job.wage.toLocaleString("en-IN")}</td>
                <td>
                    <span class="status ${app.status.toLowerCase()}">
                        ${escapeHTML(tr(app.status))}
                    </span>
                </td>
                <td>
                    <button class="secondary-btn"
                        onclick="viewApplicants(${job.id})">
                        ${tr("Manage")}
                    </button>
                    ${job.status === "completed" && app.status === "Selected" &&
                        !state.payments.some(payment =>
                            payment.jobId === job.id && payment.workerId === app.workerId
                        )
                        ? `<button class="secondary-btn"
                            onclick="recordPayment(${job.id}, ${app.workerId})">
                            ${tr("Record Payment")}
                           </button>`
                        : ""}
                </td>
            </tr>
        `)
    );
}

table.innerHTML = rows.length
    ? rows.join("")
    : `<tr><td colspan="5">${tr("No applications available.")}</td></tr>`;

document.getElementById("applicationsHeading").textContent =
    tr(currentRole === "worker" ? "My Applications" : "Manage Applications");

const headers = document.querySelectorAll("#applications thead th");

if (headers.length === 5) {
    headers[1].textContent =
        tr(currentRole === "worker" ? "Location" : "Worker");

    headers[4].textContent =
        tr(currentRole === "worker" ? "Contractor" : "Action");
}

}

function renderPayments() {
const table = document.getElementById("paymentsTable");

const payments = state.payments.filter(payment =>
    currentRole === "worker"
        ? payment.workerId === currentUser?.id
        : contractorJobs().some(job => job.id === payment.jobId)
);

document.getElementById("totalPayments").textContent =
    "₹" + payments.reduce((sum, payment) =>
        sum + payment.amount, 0
    ).toLocaleString("en-IN");

document.getElementById("paidJobs").textContent = payments.length;

table.innerHTML = payments.length
    ? payments.map(payment => `
        <tr>
            <td data-no-translate>${escapeHTML(payment.jobTitle)}</td>
            <td data-no-translate>${escapeHTML(currentRole === "worker" ? payment.contractor : payment.worker)}</td>
            <td>₹${payment.amount.toLocaleString("en-IN")}</td>
            <td><span class="status paid">${tr("Recorded")}</span></td>
        </tr>
    `).join("")
    : `<tr><td colspan="4">${tr("No payment records available.")}</td></tr>`;

}

function renderProfile() {
const profile = currentProfile();

document.getElementById("profileName").textContent = profile.name;
document.getElementById("profileName").setAttribute("data-no-translate", "");
document.getElementById("profileRole").textContent =
    tr(currentRole === "worker" ? "Worker" : "Contractor");

document.getElementById("profileAvatar").textContent =
    profile.name.charAt(0).toUpperCase() || "?";

document.getElementById("avatar").textContent =
    profile.name.charAt(0).toUpperCase() || "?";

document.getElementById("nameInput").value = profile.name;
document.getElementById("locationInput").value = profile.location;
document.getElementById("skillInput").value = profile.skill;

}

document.getElementById("profileForm").addEventListener("submit", async event => {
event.preventDefault();

const name = document.getElementById("nameInput").value.trim();
const location = document.getElementById("locationInput").value.trim();
const skill = document.getElementById("skillInput").value.trim();

if (!name || !location) {
    showToast("Name and location are required.");
    return;
}

try {
    currentUser = await apiRequest("/api/me", {
        method: "PUT",
        body: JSON.stringify({ name, location, skill })
    });
    state.profile[currentRole] = {
        id: currentUser.id,
        name: currentUser.name,
        location: currentUser.location,
        skill: currentUser.skill
    };
    await loadServerState();
    showToast("Profile saved successfully.");
} catch (error) {
    showToast(error.message);
}

});

async function recordPayment(jobId, workerId) {
if (currentRole !== "contractor") {
showToast("Only contractors can record payments.");
return;
}

const job = state.jobs.find(item => item.id === jobId);

if (!job ||
    !contractorJobs().some(item => item.id === jobId)) {
    showToast("You can only manage your own jobs.");
    return;
}

if (job.status !== "completed") {
    showToast("Complete the job before recording payment.");
    return;
}

const applicant = job.applicants.find(app =>
    app.workerId === workerId && app.status === "Selected"
);

if (!applicant) {
    showToast("Only selected workers can receive payment records.");
    return;
}

const alreadyPaid = state.payments.some(payment =>
    payment.jobId === jobId && payment.workerId === workerId
);

if (alreadyPaid) {
    showToast("A payment record already exists for this worker.");
    return;
}

try {
    await apiRequest("/api/payments", {
        method: "POST",
        body: JSON.stringify({ jobId, workerId, amount: job.wage })
    });
    await loadServerState();
    showToast("Payment record saved. No money was transferred.");
} catch (error) {
    showToast(error.message);
}

}

loadServerState().catch(error => {
    console.error("Could not load Shramic Local data:", error);
    showToast(error.message || "Could not connect to the server.");
});