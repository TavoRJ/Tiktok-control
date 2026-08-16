/**
 * Controlador de interfaz y lógica cliente para el widget de Recetas de Cocina.
 * 
 * @param {object} socket Instancia de la conexión Socket.io cliente.
 */
export function initRecetasUI(socket) {
    // 1. Escuchar la inicialización y actualizaciones de la receta desde el servidor
    socket.on('initReceta', (config) => {
        if (!config) return;
        
        const titleInput = document.getElementById('vs-title-input');
        if (titleInput && titleInput.value !== config.title) {
            titleInput.value = config.title || '';
        }
        
        const container = document.getElementById('ingredients-container');
        if (container) {
            const inputs = container.querySelectorAll('.vs-item-name-input');
            const items = config.items || [];
            if (inputs.length !== items.length || inputs.length === 0) {
                container.innerHTML = '';
                items.forEach(item => {
                    const row = document.createElement('div');
                    row.className = 'vs-control-row';
                    row.style = 'display: flex; gap: 10px; align-items: center; width: 100%; margin-bottom: 8px;';
                    row.innerHTML = `
                        <input type="text" class="vs-item-name-input" value="${item.name || ''}" placeholder="Ingrediente...">
                        <button type="button" class="btn-delete-ingredient" style="background: transparent; border: none; color: #ff3b30; cursor: pointer; padding: 4px; display: inline-flex; align-items: center; justify-content: center; transition: background-color 0.2s; border-radius: 4px; height: 38px; width: 38px; flex-shrink: 0;">
                            <i data-lucide="trash-2" style="width: 16px; height: 16px;"></i>
                        </button>
                    `;

                    row.querySelector('.btn-delete-ingredient').addEventListener('click', () => {
                        row.remove();
                        emitRecipeUpdate(socket, titleInput);
                    });

                    row.querySelector('.vs-item-name-input').addEventListener('input', () => {
                        emitRecipeUpdate(socket, titleInput);
                    });

                    container.appendChild(row);
                });
                if (window.lucide) window.lucide.createIcons();
            }
        }
    });

    // 2. Escuchar eventos Custom DOM disparados desde la UI del panel
    window.addEventListener('ui:recipeAction', (e) => {
        socket.emit('manual_control', { action: e.detail.action });
    });

    window.addEventListener('ui:recipeUpdate', (e) => {
        socket.emit('manual_control', {
            action: 'vs_update',
            title: e.detail.title,
            items: e.detail.items
        });
    });
}

/**
 * Reconstruye la lista de ingredientes y la envía al servidor.
 * 
 * @param {object} socket Instancia de Socket.io.
 * @param {HTMLElement} titleInput Input del título del Versus/Receta.
 */
function emitRecipeUpdate(socket, titleInput) {
    const updatedItems = [];
    document.querySelectorAll('.vs-item-name-input').forEach(input => {
        if (input.value.trim() !== '') {
            updatedItems.push({ name: input.value, count: 1 });
        }
    });
    socket.emit('manual_control', {
        action: 'vs_update',
        title: titleInput ? titleInput.value : '',
        items: updatedItems
    });
}
