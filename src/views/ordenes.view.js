// src/views/ordenes.view.js
import api from '../lib/api.js';
import { notify, setText, askConfirm } from '../lib/ui.js';
import { getUser } from '../lib/auth.js';
import { Html5Qrcode } from 'html5-qrcode';

let ordersList = [];
let machinesList = [];
let techniciansList = [];
let sparePartsList = [];
let repuestosAnadidos = [];
let scanner = null;

export async function initOrdersView() {
    await loadDependencies();
    await loadOrders();
    setupEventListeners();
    
    // Polling silente cada 5 segundos (KISS real-time)
    setInterval(() => loadOrders(true), 5000);
}

async function loadOrders(silent = false) {
    const container = document.getElementById('orders-list');
    
    if (silent && container) {
        const activeInputs = Array.from(container.querySelectorAll("select[id^='review-rating-'], textarea[id^='review-comment-']"));
        const hasUnsavedChanges = activeInputs.some(input => input.value !== "" || document.activeElement === input);
        if (hasUnsavedChanges) return;
    }

    if (!silent && container) container.innerHTML = `<div class="p-8 text-center text-zinc-500 dark:text-zinc-400">Loading orders...</div>`;

    try {
        const filters = {
            status: document.getElementById('filter-status')?.value || '',
            search: document.getElementById('search-input')?.value || ''
        };
        const response = await api.workOrders.getAll(filters);
        let rawOrders = Array.isArray(response) ? response : (response.data || []);

        const user = getUser();
        if (user && user.role === 'technician') {
            rawOrders = rawOrders.filter(wo => wo.technician_id === user.id);
        }

        const statusWeight = { 'in_progress': 1, 'open': 2, 'closed': 3 };
        ordersList = rawOrders.sort((a, b) => {
            const wA = statusWeight[a.status] || 99;
            const wB = statusWeight[b.status] || 99;
            if (wA !== wB) return wA - wB;
            return b.id - a.id;
        });

        renderTable();
    } catch (error) { if (!silent) notify.error("Error loading orders"); }
}

async function loadDependencies() {
    try {
        const mRes = await api.machines.getAll();
        machinesList = mRes.data || mRes || [];
        const machineOptions = `<option value="">Select machine...</option>` +
            machinesList.map(m => `<option value="${m.id}">${m.name} (${m.asset_code})</option>`).join('');
        document.getElementById('machine_id').innerHTML = machineOptions;
        document.getElementById('edit_machine_id').innerHTML = machineOptions;
    } catch (e) { console.error("Error loading machines", e); }

    try {
        const tRes = await api.getUsers();
        techniciansList = (tRes.data || tRes || []).filter(u => u.role === 'technician');
        const techOptions = `<option value="">Unassigned</option>` +
            techniciansList.map(t => `<option value="${t.id}">${t.full_name}</option>`).join('');
        document.getElementById('technician_id').innerHTML = techOptions;
        document.getElementById('edit_technician_id').innerHTML = techOptions;
    } catch (e) {
        const fallback = `<option value="">Unassigned</option>`;
        document.getElementById('technician_id').innerHTML = fallback;
        document.getElementById('edit_technician_id').innerHTML = fallback;
    }

    try {
        const sRes = await api.spareParts.getAll();
        sparePartsList = sRes.data || sRes || [];
        document.getElementById('part-select').innerHTML = `<option value="">Select spare part...</option>` +
            sparePartsList.map(p => `<option value="${p.id}">${p.name} (Stock: ${p.current_stock})</option>`).join('');
    } catch (e) { console.error("Error loading spare parts", e); }
}

function renderTable() {
    const container = document.getElementById('orders-list');
    if (!container) return;

    if (ordersList.length === 0) {
        container.innerHTML = `<div class="p-8 text-center text-zinc-500 dark:text-zinc-400">No orders to show.</div>`;
        return;
    }

    const statusLabels = { 'open': 'Pending', 'in_progress': 'In Progress', 'closed': 'Completed' };
    const statusClass = {
        'open': 'bg-yellow-50 text-yellow-700 dark:bg-yellow-500/10 dark:text-yellow-400',
        'in_progress': 'bg-blue-50 text-blue-800 dark:bg-blue-500/10 dark:text-blue-400',
        'closed': 'bg-green-50 text-green-800 dark:bg-green-500/10 dark:text-green-400'
    };

    const leftLineColors = {
        'open': 'bg-yellow-500',
        'in_progress': 'bg-blue-500',
        'closed': 'bg-green-500'
    };

    container.innerHTML = ordersList.map(wo => {
        const label = statusLabels[wo.status] || wo.status;
        const badge = statusClass[wo.status] || 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300';
        
        const leftLineColors = {
            'open': 'bg-yellow-500',
            'in_progress': 'bg-blue-500',
            'closed': 'bg-green-500'
        };
        const leftLineColor = leftLineColors[wo.status] || 'bg-zinc-300 dark:bg-zinc-700';

        return `
        <div class="relative overflow-hidden grid grid-cols-1 md:grid-cols-12 gap-2 md:gap-4 p-4 items-center text-sm hover:md:bg-zinc-50 dark:hover:md:bg-zinc-800/50 transition-colors bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl md:border-0 md:bg-transparent dark:md:bg-transparent md:rounded-none shadow-sm md:shadow-none">
            <div class="absolute left-0 top-0 bottom-0 w-1 ${leftLineColor}"></div>
            <div class="md:col-span-1 font-medium text-zinc-900 dark:text-zinc-100 pl-4 md:pl-2 pt-2 md:pt-0">
                <span class="md:hidden text-xs text-zinc-500 block mb-1">Code</span>
                #${wo.id}
            </div>
            <div class="md:col-span-2 font-bold md:font-normal dark:text-zinc-100 pl-4 md:pl-0">
                <span class="md:hidden text-xs text-zinc-500 block mb-1">Machine</span>
                ${wo.machine_name}
            </div>
            <div class="md:col-span-3 text-zinc-600 dark:text-zinc-400 truncate pl-4 md:pl-0">
                <span class="md:hidden text-xs text-zinc-500 block mb-1">Description</span>
                ${wo.issue_description || 'No description'}
            </div>
            <div class="md:col-span-2 pl-4 md:pl-0">
                <span class="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide ${badge}">
                    ${label}
                </span>
            </div>
            <div class="md:col-span-1 text-zinc-600 dark:text-zinc-400 truncate pl-4 md:pl-0">
                <span class="md:hidden text-xs text-zinc-500 block mb-1">Technician</span>
                ${wo.technician_name || 'Unassigned'}
            </div>
            <div class="md:col-span-3 grid grid-cols-2 lg:flex lg:flex-row gap-2 pl-4 md:pl-0 mt-4 md:mt-0 md:justify-end md:pr-2 w-full">
                ${wo.status === 'open' ? `<button onclick="window.startOrder(${wo.id})" class="col-span-2 lg:col-auto w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 md:py-2 px-4 rounded-xl transition-colors text-sm shadow-sm md:shadow-none">Start</button>` : ''}
                ${wo.status === 'in_progress' ? `<button onclick="window.openCloseModal(${wo.id})" class="col-span-2 lg:col-auto w-full bg-green-600 hover:bg-green-500 text-white font-bold py-3 md:py-2 px-4 rounded-xl transition-colors text-sm shadow-sm md:shadow-none">Resolve</button>` : ''}
                ${wo.status !== 'closed' ? `<button onclick="window.editOrder(${wo.id})" class="admin-only col-span-1 lg:col-auto w-full bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 hover:bg-zinc-200 dark:hover:bg-zinc-700 font-bold py-3 md:py-2 px-4 rounded-xl transition-colors text-sm">Edit</button>` : ''}
                <button onclick="window.deleteOrder(${wo.id})" class="admin-only col-span-1 lg:col-auto w-full bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-500/10 dark:text-red-400 dark:hover:bg-red-500/20 font-bold py-3 md:py-2 px-4 rounded-xl transition-colors text-sm">Delete</button>
            </div>
            
            <div class="md:col-span-12 w-full mt-4 pt-4 border-t border-zinc-100 dark:border-zinc-800">
                <form onsubmit="window.submitReview(event, ${wo.id})" class="flex flex-col sm:flex-row gap-3 items-end sm:items-start" id="review-form-${wo.id}">
                    <div class="w-full sm:w-auto">
                        <label class="block text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase mb-1">Puntuación</label>
                        <select id="review-rating-${wo.id}" required class="w-full sm:w-24 px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-800 text-sm bg-white dark:bg-zinc-900 dark:text-zinc-100 outline-none focus:ring-2 focus:ring-yellow-500">
                            <option value="">--</option>
                            <option value="5">5</option>
                            <option value="4">4</option>
                            <option value="3">3</option>
                            <option value="2">2</option>
                            <option value="1">1</option>
                        </select>
                    </div>
                    <div class="w-full flex-1">
                        <label class="block text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase mb-1">Comentario</label>
                        <textarea id="review-comment-${wo.id}" required rows="1" class="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-800 text-sm bg-white dark:bg-zinc-900 dark:text-zinc-100 outline-none focus:ring-2 focus:ring-yellow-500" placeholder="Escribe tu reseña de la orden..."></textarea>
                    </div>
                    <button type="submit" class="w-full sm:w-auto bg-yellow-500 text-zinc-950 font-bold py-2 px-4 rounded-lg hover:bg-yellow-400 transition-all text-sm h-[38px] self-end hidden sm:block">
                        Enviar
                    </button>
                    <button type="submit" class="w-full bg-yellow-500 text-zinc-950 font-bold py-3 rounded-lg hover:bg-yellow-400 transition-all text-sm sm:hidden mt-2">
                        Enviar Reseña
                    </button>
                </form>
                <div id="review-display-${wo.id}" class="hidden mt-3 p-3 bg-zinc-50 dark:bg-zinc-800/50 rounded-lg text-sm text-zinc-700 dark:text-zinc-300">
                </div>
            </div>
        </div>
        `;
    }).join('');
}

function setupEventListeners() {
    document.getElementById('search-input')?.addEventListener('input', () => loadOrders());
    document.getElementById('filter-status')?.addEventListener('change', () => loadOrders());
    document.getElementById('btn-new-order')?.addEventListener('click', () => {
        document.getElementById('form-new-order').reset();
        document.getElementById('modal-new-order').classList.remove('hidden');
    });

    const formNew = document.getElementById('form-new-order');
    formNew?.addEventListener('submit', async function (e) {
        e.preventDefault();

        const machineValue = document.getElementById('machine_id').value;
        if (machineValue === "") return;

        const techValue = document.getElementById('technician_id').value;
        const data = {
            machine_id: parseInt(machineValue, 10),
            ...(techValue && { technician_id: parseInt(techValue, 10) }),
            issue_description: formNew.querySelector('[name="issue_description"]').value
        };

        try {
            await api.workOrders.create(data);
            notify.success("Work order created successfully");
            document.getElementById('modal-new-order').classList.add('hidden');
            loadOrders();
        } catch (err) { notify.error(err.message); }
    });

    document.getElementById('btn-add-part')?.addEventListener('click', () => {
        const select = document.getElementById('part-select');
        const qtyInput = document.getElementById('part-qty');

        const partId = parseInt(select.value, 10);
        const qty = parseInt(qtyInput.value, 10);

        if (!partId || isNaN(qty) || qty <= 0) return;

        const part = sparePartsList.find(p => p.id === partId);
        const existe = repuestosAnadidos.find(r => r.part_id === partId);
        const totalQty = (existe ? existe.quantity : 0) + qty;

        if (totalQty > part.current_stock) {
            notify.error(`Insufficient stock. Only ${part.current_stock} unit(s) available.`);
            return;
        }

        if (existe) existe.quantity += qty;
        else repuestosAnadidos.push({ part_id: partId, name: part.name, quantity: qty });

        renderPartsList();
        select.value = "";
        qtyInput.value = "1";
    });

    const formClose = document.getElementById('form-close-order');
    formClose?.addEventListener('submit', async function (e) {
        e.preventDefault();
        const id = document.getElementById('close-order-id').value;
        const data = {
            resolution_comment: formClose.querySelector('[name="resolution_comment"]').value,
            partsUsed: repuestosAnadidos.map(r => ({ id_part: r.part_id, quantity_used: r.quantity }))
        };
        try {
            await api.workOrders.close(id, data);
            notify.success("Order resolved and closed");
            stopQRScanner();
            document.getElementById('modal-close-order').classList.add('hidden');
            loadOrders();
        } catch (err) { notify.error(err.message); }
    });

    const formEdit = document.getElementById('form-edit-order');
    formEdit?.addEventListener('submit', async function (e) {
        e.preventDefault();
        const id = document.getElementById('edit-order-id').value;
        const data = {
            machine_id: parseInt(document.getElementById('edit_machine_id').value, 10),
            technician_id: document.getElementById('edit_technician_id').value ? parseInt(document.getElementById('edit_technician_id').value, 10) : null,
            issue_description: document.getElementById('edit_issue_description').value
        };
        try {
            await api.workOrders.update(id, data);
            notify.success("Order updated");
            document.getElementById('modal-edit-order').classList.add('hidden');
            loadOrders();
        } catch (err) { notify.error(err.message); }
    });

    document.getElementById('btn-scan-qr')?.addEventListener('click', startQRScanner);
    document.getElementById('btn-stop-scan')?.addEventListener('click', stopQRScanner);

    window.closeModalAndStopScanner = () => {
        stopQRScanner();
        document.getElementById('modal-close-order').classList.add('hidden');
    };
}

async function startQRScanner() {
    const container = document.getElementById('qr-scanner-container');
    if (!container) return;
    container.classList.remove('hidden');
    scanner = new Html5Qrcode('qr-scanner-container');
    await scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 200, height: 200 } },
        (sku) => {
            const part = sparePartsList.find(p => p.sku === sku);
            if (part) {
                document.getElementById('part-select').value = part.id;
                stopQRScanner();
            }
        },
        () => {} // ignore decode errors silently
    ).catch(() => {
        notify.error('Camera access denied or not available');
        container.classList.add('hidden');
    });
}

async function stopQRScanner() {
    if (scanner) {
        await scanner.stop().catch(() => {});
        scanner = null;
    }
    const container = document.getElementById('qr-scanner-container');
    if (container) container.classList.add('hidden');
}

function renderPartsList() {
    const list = document.getElementById('parts-list');
    if (!list) return;
    list.innerHTML = repuestosAnadidos.map((r, index) => `
        <li class="flex justify-between items-center bg-white dark:bg-zinc-900 p-2 rounded border border-zinc-200 dark:border-zinc-800 text-sm">
            <span class="text-zinc-700 dark:text-zinc-300">${r.quantity}x ${r.name}</span>
            <button type="button" onclick="window.removePart(${index})" class="text-red-500 font-bold px-2 hover:bg-red-50 dark:hover:bg-red-900/20 rounded">✕</button>
        </li>
    `).join('');
}

window.startOrder = async (id) => {
    try {
        await api.workOrders.start(id);
        notify.success("Maintenance started — order is now in progress");
        loadOrders();
    } catch (err) {
        notify.error("Could not start order: " + err.message);
    }
};
window.openCloseModal = (id) => {
    stopQRScanner();
    document.getElementById('close-order-id').value = id;
    document.getElementById('form-close-order')?.reset();
    repuestosAnadidos = [];
    renderPartsList();
    document.getElementById('modal-close-order').classList.remove('hidden');
};
window.editOrder = (id) => {
    const wo = ordersList.find(o => o.id === id);
    if (!wo) return;
    document.getElementById('edit-order-id').value = wo.id;
    document.getElementById('edit_machine_id').value = wo.machine_id;
    document.getElementById('edit_technician_id').value = wo.technician_id || '';
    document.getElementById('edit_issue_description').value = wo.issue_description;
    document.getElementById('modal-edit-order').classList.remove('hidden');
};
window.deleteOrder = async (id) => {
    if (await askConfirm("Delete order?", "This action cannot be undone. It will be permanently removed from the system.")) {
        try {
            await api.workOrders.delete(id);
            notify.success("Order deleted");
            loadOrders();
        } catch (err) {
            notify.error("Could not delete order: " + err.message);
        }
    }
};

window.submitReview = async (event, workOrderId) => {
    event.preventDefault();
    const rating = document.getElementById(`review-rating-${workOrderId}`).value;
    const comment = document.getElementById(`review-comment-${workOrderId}`).value;

    try {
        await api.reviews.create({
            work_order_id: workOrderId,
            nota: parseInt(rating, 10),
            comentario: comment
        });
        
        notify.success("Reseña enviada con exito");
        
        const display = document.getElementById(`review-display-${workOrderId}`);
        display.innerHTML = `<strong>Puntuación:</strong> ${rating}/5 <br/> <strong>Comentario:</strong> ${comment}`;
        display.classList.remove('hidden');
        
        document.getElementById(`review-form-${workOrderId}`).reset();
    } catch (err) {
        notify.error("Error al enviar la reseña: " + err.message);
    }
};

window.removePart = (index) => { repuestosAnadidos.splice(index, 1); renderPartsList(); };