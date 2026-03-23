document.addEventListener('DOMContentLoaded', () => {
    // Selectors
    const todoForm = document.getElementById('todo-form');
    const todoInput = document.getElementById('todo-input');
    const todoList = document.getElementById('todo-list');
    const emptyState = document.getElementById('empty-state');
    const totalTasksEl = document.getElementById('total-tasks');
    const completedTasksEl = document.getElementById('completed-tasks');
    const clearAllBtn = document.getElementById('clear-all');
    const categoriesSection = document.querySelector('.categories-section');

    // Progress Bar Selectors
    const progressWrapper = document.getElementById('progress-wrapper');
    const progressPercent = document.getElementById('progress-percent');
    const progressFill = document.getElementById('progress-fill');

    // UI Custom Modal Selectors
    const customModal = document.getElementById('custom-modal');
    const modalTitle = document.getElementById('modal-title');
    const modalDesc = document.getElementById('modal-desc');
    const modalInput = document.getElementById('modal-input');

    // State
    // Strip out all legacy tasks that used cat_general if the user explicitly wants them gone, 
    // or just let the user delete the category manually. Since the user asked to delete "All" and "General", 
    // we'll remove it from the defaults. If they already have "cat_general" in localStorage, we can 
    // leave it and let them delete it via the UI since we just unlocked deleting it, OR we proactively wipe it.
    // Proactively wiping it could destroy their tasks. Let's just remove the default and unlock deletion!
    let todos = JSON.parse(localStorage.getItem('todos')) || [];
    let categories = JSON.parse(localStorage.getItem('categories')) || [];
    
    let currentCategoryFilter = categories.length > 0 ? categories[0].id : null; 

    // Initialize
    renderCategories();
    renderTodos();

    // Event Listeners
    todoForm.addEventListener('submit', addTodo);
    todoList.addEventListener('click', handleTodoAction);
    todoList.addEventListener('dblclick', handleDoubleClick);
    clearAllBtn.addEventListener('click', clearAll);
    categoriesSection.addEventListener('click', handleCategoryAction);
    
    // Global Keyboard listener for Smart Input
    document.addEventListener('keydown', (e) => {
        if (e.key === '/' && document.activeElement !== todoInput && !e.target.matches('input') && !customModal.classList.contains('active')) {
            e.preventDefault();
            todoInput.focus();
        }
    });

    // Custom UI Dialog Logic
    function showModal({ title, desc, showInput, confirmText = 'تأكيد', isDanger = false }) {
        return new Promise(resolve => {
            modalTitle.textContent = title;
            
            if (desc) {
                modalDesc.textContent = desc;
                modalDesc.classList.remove('hidden');
            } else {
                modalDesc.classList.add('hidden');
            }
            
            if (showInput) {
                modalInput.value = '';
                modalInput.classList.remove('hidden');
                setTimeout(() => modalInput.focus(), 150);
            } else {
                modalInput.classList.add('hidden');
            }
            
            const actionsDiv = document.querySelector('.modal-actions');
            actionsDiv.innerHTML = `
                <button id="modal-cancel" class="btn-cancel">إلغاء</button>
                <button id="modal-confirm" class="btn-confirm ${isDanger ? 'danger' : ''}">${confirmText}</button>
            `;
            const modalConfirm = document.getElementById('modal-confirm');
            const modalCancel = document.getElementById('modal-cancel');
            
            if (!isDanger) {
                modalConfirm.style.background = 'var(--primary-gradient)';
            }
            
            customModal.classList.remove('hidden');
            setTimeout(() => customModal.classList.add('active'), 10);
            
            const cleanUp = () => {
                customModal.classList.remove('active');
                setTimeout(() => customModal.classList.add('hidden'), 350);
            };
            
            const handleConfirm = () => {
                const result = showInput ? modalInput.value.trim() : true;
                cleanUp();
                resolve(result);
            };
            
            const handleCancel = () => {
                cleanUp();
                resolve(null);
            };
            
            modalConfirm.addEventListener('click', handleConfirm);
            modalCancel.addEventListener('click', handleCancel);
            
            modalInput.onkeydown = (e) => {
                if (e.key === 'Enter') { e.preventDefault(); handleConfirm(); }
                if (e.key === 'Escape') { e.preventDefault(); handleCancel(); }
            };
            
            const escHandler = (e) => {
                if (e.key === 'Escape' && customModal.classList.contains('active')) {
                    handleCancel();
                    window.removeEventListener('keydown', escHandler);
                }
            };
            window.addEventListener('keydown', escHandler);
        });
    }

    // Core Data Functions
    function saveTodos() {
        localStorage.setItem('todos', JSON.stringify(todos));
        updateStatsAndProgress();
        checkEmptyState();
    }
    
    function saveCategories() {
        localStorage.setItem('categories', JSON.stringify(categories));
    }

    function generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    }

    function findNode(nodes, id) {
        for (let node of nodes) {
            if (node.id === id) return node;
            if (node.children) {
                let found = findNode(node.children, id);
                if (found) return found;
            }
        }
        return null;
    }

    function deleteNode(nodes, id) {
        for (let i = 0; i < nodes.length; i++) {
            if (nodes[i].id === id) {
                nodes.splice(i, 1);
                return true;
            }
            if (nodes[i].children && nodes[i].children.length > 0) {
                if (deleteNode(nodes[i].children, id)) return true;
            }
        }
        return false;
    }

    function getStats(nodes) {
        let total = 0;
        let completed = 0;
        for (let current of nodes) {
            total++;
            if (current.completed) completed++;
            if (current.children) {
                let childStats = getStats(current.children);
                total += childStats.total;
                completed += childStats.completed;
            }
        }
        return { total, completed };
    }

    function getCategoryName(id) {
        const cat = categories.find(c => c.id === id);
        return cat ? cat.name : 'محذوفة';
    }

    // Smart Sorting
    function sortNodes(nodes) {
        nodes.forEach(node => {
            if (node.children) node.children = sortNodes(node.children);
        });
        
        return nodes.sort((a, b) => {
            if (a.completed === b.completed) return 0;
            return a.completed ? 1 : -1;
        });
    }

    // Category Handlers
    async function editOrDeleteCategory(id) {
        const cat = categories.find(c => c.id === id);
        if (!cat) return;

        return new Promise(resolve => {
            modalTitle.textContent = "إدارة الفئة: " + cat.name;
            modalDesc.textContent = "تعديل الاسم أو حذف الفئة نهائياً.";
            modalDesc.classList.remove('hidden');
            modalInput.value = cat.name;
            modalInput.classList.remove('hidden');
            setTimeout(() => modalInput.focus(), 150);
            
            const actionsDiv = document.querySelector('.modal-actions');
            actionsDiv.innerHTML = `
                <button id="modal-del" class="btn-cancel" style="color: var(--danger); margin-right: auto; padding: 0.6rem 0.2rem;">حذف الفئة</button>
                <div style="display:flex; gap:10px;">
                    <button id="modal-cancel" class="btn-cancel">إلغاء</button>
                    <button id="modal-confirm" class="btn-confirm" style="background: var(--primary-gradient);">حفظ</button>
                </div>
            `;
            
            const btnConfirm = document.getElementById('modal-confirm');
            const btnCancel = document.getElementById('modal-cancel');
            const btnDel = document.getElementById('modal-del');
            
            customModal.classList.remove('hidden');
            setTimeout(() => customModal.classList.add('active'), 10);
            
            const cleanUp = () => {
                customModal.classList.remove('active');
                setTimeout(() => customModal.classList.add('hidden'), 350);
            };

            const saveChanges = () => {
                const newName = modalInput.value.trim();
                if (newName && newName !== cat.name) {
                    cat.name = newName;
                    saveCategories();
                    renderCategories();
                    renderTodos();
                }
                cleanUp();
                resolve();
            };

            const deleteCategory = async () => {
                cleanUp();
                
                let tasksInCat = todos.filter(t => t.categoryId === id);
                let proceed = true;
                
                if (tasksInCat.length > 0) {
                    proceed = await showModal({
                        title: 'تأكيد الحذف',
                        desc: `هذه الفئة تحتوي على ${tasksInCat.length} مهام رئيسية. سيتم حذف الفئة وجميع المهام بداخلها. هل أنت متأكد؟`,
                        showInput: false,
                        confirmText: 'حذف الفئة والمهام',
                        isDanger: true
                    });
                } else {
                    proceed = await showModal({
                        title: 'حذف الفئة',
                        desc: `هل أنت متأكد من حذف فئة "${cat.name}"؟`,
                        showInput: false,
                        confirmText: 'حذف',
                        isDanger: true
                    });
                }
                
                if (proceed) {
                    todos = todos.filter(t => t.categoryId !== id);
                    saveTodos();
                    
                    categories = categories.filter(c => c.id !== id);
                    saveCategories();
                    
                    currentCategoryFilter = categories.length > 0 ? categories[0].id : null;
                    renderCategories();
                    renderTodos();
                }
                resolve();
            };
            
            btnConfirm.onclick = saveChanges;
            btnCancel.onclick = () => { cleanUp(); resolve(); };
            btnDel.onclick = deleteCategory;
            
            modalInput.onkeydown = (e) => {
                if (e.key === 'Enter') { e.preventDefault(); saveChanges(); }
                if (e.key === 'Escape') { e.preventDefault(); cleanUp(); resolve(); }
            };
        });
    }

    async function handleCategoryAction(e) {
        const catBtn = e.target.closest('.cat-btn');
        if (catBtn) {
            const catId = catBtn.dataset.id;
            
            if (currentCategoryFilter === catId) {
                await editOrDeleteCategory(catId);
            } else {
                currentCategoryFilter = catId;
                renderCategories();
                renderTodos();
            }
            return;
        }

        const addBtn = e.target.closest('#add-category-btn');
        if (addBtn) {
            const name = await showModal({
                title: 'إضافة فئة جديدة',
                desc: 'اكتب اسم للفئة لتنظيم قوائمك (مثل: العمل، المنزل..)',
                showInput: true,
                confirmText: 'إضافة'
            });

            if (name && name.trim()) {
                const newCat = {
                    id: 'cat_' + generateId(),
                    name: name.trim()
                };
                categories.push(newCat);
                saveCategories();
                currentCategoryFilter = newCat.id; // Switch to the new category
                renderCategories();
                renderTodos();
            }
        }
    }

    function renderCategories() {
        const container = document.getElementById('dynamic-categories');
        container.innerHTML = '';
        
        categories.forEach(cat => {
            const btn = document.createElement('button');
            btn.className = `cat-btn ${currentCategoryFilter === cat.id ? 'active' : ''}`;
            btn.dataset.id = cat.id;
            btn.innerHTML = escapeHTML(cat.name);
            container.appendChild(btn);
        });
    }

    // Task Handlers
    function addTodo(e) {
        e.preventDefault();
        const text = todoInput.value.trim();
        
        if (text) {
            if (!currentCategoryFilter) {
                showModal({
                    title: 'تنبيه',
                    desc: 'يجب أن يكون لديك فئة واحدة على الأقل. قم بإضافة فئة جديدة لتبدأ.',
                    showInput: false,
                    confirmText: 'حسناً'
                });
                return;
            }

            const newTodo = {
                id: generateId(),
                categoryId: currentCategoryFilter,
                text: text,
                completed: false,
                expanded: true,
                children: []
            };
            
            todos.unshift(newTodo);
            saveTodos();
            renderTodos();
            
            todoInput.value = '';
            todoInput.focus();
        }
    }

    function openEditInput(wrapper, id) {
        const todo = findNode(todos, id);
        const todoItem = wrapper.querySelector('.todo-item');
        if (todoItem.classList.contains('editing')) return;
        
        const todoContent = todoItem.querySelector('.todo-content');
        const textEl = todoContent.querySelector('.todo-text');
        const currentText = todo.text;
        
        todoItem.classList.add('editing');
        
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'edit-input';
        input.style.flex = "1";
        input.value = currentText;
        
        const childBadge = todoContent.querySelector('.progress-badge');
        if (childBadge) childBadge.style.display = 'none';

        textEl.replaceWith(input);
        input.focus();
        
        const saveEdit = () => {
            const newText = input.value.trim();
            if (newText) {
                todo.text = newText;
                saveTodos();
            }
            renderTodos();
        };
        
        input.addEventListener('blur', saveEdit);
        input.addEventListener('keydown', (ev) => {
            if (ev.key === 'Enter') {
                ev.preventDefault();
                saveEdit();
            } else if (ev.key === 'Escape') {
                ev.preventDefault();
                renderTodos();
            }
        });
    }

    function handleDoubleClick(e) {
        const target = e.target;
        if (target.closest('.todo-text')) {
            const wrapper = target.closest('.todo-item-wrapper');
            if (wrapper) {
                openEditInput(wrapper, wrapper.dataset.id);
            }
        }
    }

    function handleTodoAction(e) {
        const target = e.target;
        const wrapper = target.closest('.todo-item-wrapper');
        
        if (!wrapper) return;
        
        const id = wrapper.dataset.id;
        
        if (target.closest('.toggle-btn')) {
            const todo = findNode(todos, id);
            if (todo && todo.children && todo.children.length > 0) {
                todo.expanded = !todo.expanded;
                saveTodos();
                renderTodos();
            }
            return;
        }

        if (target.closest('.delete')) {
            wrapper.querySelector('.todo-item').classList.add('fadeOut');
            setTimeout(() => {
                deleteNode(todos, id);
                saveTodos();
                renderTodos();
            }, 300); 
            return;
        }

        if (target.closest('.add-sub')) {
            if (wrapper.querySelector('.subtask-form')) return;
            
            const todoItem = wrapper.querySelector('.todo-item');
            todoItem.classList.add('editing');
            
            const formHtml = document.createElement('form');
            formHtml.className = 'subtask-form todo-item fade-in';
            formHtml.style.marginTop = '4px';
            formHtml.innerHTML = `
                <div class="input-group" style="width: 100%;">
                    <input type="text" class="edit-input" placeholder="اكتب المهمة الفرعية (اضغط Esc للإلغاء)" autoFocus style="flex: 1; padding: 5px;">
                    <div class="actions" style="opacity: 1; transform: translateX(0);">
                        <button type="submit" class="action-btn add-sub-confirm" style="color: var(--success);"><i class="fa-solid fa-check"></i></button>
                        <button type="button" class="action-btn cancel-sub" style="color: var(--danger);"><i class="fa-solid fa-xmark"></i></button>
                    </div>
                </div>
            `;
            
            todoItem.after(formHtml);
            const input = formHtml.querySelector('input');
            input.focus();
            
            formHtml.addEventListener('submit', (ev) => {
                ev.preventDefault();
                const text = input.value.trim();
                if (text) {
                    const todo = findNode(todos, id);
                    if (!todo.children) todo.children = [];
                    todo.children.unshift({
                        id: generateId(),
                        text: text,
                        completed: false,
                        expanded: true,
                        children: []
                    });
                    todo.expanded = true;
                    saveTodos();
                }
                renderTodos();
            });
            
            formHtml.querySelector('input').addEventListener('keydown', (ev) => {
                if (ev.key === 'Escape') renderTodos();
            });
            
            formHtml.querySelector('.cancel-sub').addEventListener('click', () => {
                renderTodos();
            });
            return;
        }
        
        if (target.closest('.edit')) {
            openEditInput(wrapper, id);
            return;
        }
        
        if (target.closest('.todo-content') && !wrapper.querySelector('.todo-item').classList.contains('editing') && !target.closest('.toggle-btn')) {
            if (e.detail === 1) { 
                setTimeout(() => {
                    if (wrapper.querySelector('.todo-item').classList.contains('editing')) return;
                    
                    const todo = findNode(todos, id);
                    if (todo) {
                        todo.completed = !todo.completed;
                        saveTodos();
                        renderTodos();
                    }
                }, 200);
            }
        }
    }

    function createTodoElement(todo) {
        const li = document.createElement('li');
        li.className = 'todo-item-wrapper';
        li.dataset.id = todo.id;
        
        const itemDiv = document.createElement('div');
        itemDiv.className = `todo-item fade-in ${todo.completed ? 'completed' : ''}`;
        
        const hasChildren = todo.children && todo.children.length > 0;
        const isExpanded = todo.expanded !== false;
        
        let childProgressBadge = '';
        if (hasChildren) {
            const childStats = getStats(todo.children);
            const isDone = childStats.total > 0 && childStats.completed === childStats.total;
            const badgeClass = isDone ? 'progress-badge done' : 'progress-badge';
            childProgressBadge = `<span class="${badgeClass}">${childStats.completed}/${childStats.total}</span>`;
        }

        itemDiv.innerHTML = `
            <div class="todo-content">
                <button class="toggle-btn ${hasChildren ? '' : 'invisible'} ${isExpanded ? 'expanded' : ''}">
                    <i class="fa-solid fa-chevron-left"></i>
                </button>
                <div class="checkbox-custom">
                    <i class="fa-solid fa-check"></i>
                </div>
                <span class="todo-text">${escapeHTML(todo.text)}</span>
                ${childProgressBadge}
            </div>
            <div class="actions">
                <button class="action-btn add-sub" title="إضافة مهمة فرعية"><i class="fa-solid fa-plus"></i></button>
                <button class="action-btn edit" title="تعديل"><i class="fa-solid fa-pen"></i></button>
                <button class="action-btn delete" title="حذف"><i class="fa-solid fa-trash"></i></button>
            </div>
        `;
        
        li.appendChild(itemDiv);
        
        if (hasChildren && isExpanded) {
            const subList = document.createElement('ul');
            subList.className = 'subtasks-list';
            todo.children.forEach(child => {
                subList.appendChild(createTodoElement(child));
            });
            li.appendChild(subList);
        }
        
        return li;
    }

    function renderTodos() {
        todoList.innerHTML = '';
        
        if (!currentCategoryFilter) {
            updateStatsAndProgress();
            return;
        }

        let rootNodes = todos.filter(t => t.categoryId === currentCategoryFilter);
        rootNodes = sortNodes(rootNodes);
        
        rootNodes.forEach(todo => {
            todoList.appendChild(createTodoElement(todo));
        });
        
        updateStatsAndProgress();
    }

    async function clearAll() {
        if (!currentCategoryFilter) return;
        
        let rootNodes = todos.filter(t => t.categoryId === currentCategoryFilter);
        if (rootNodes.length === 0) return;
        
        const confirmed = await showModal({ 
            title: 'تأكيد المسح', 
            desc: 'هل أنت متأكد من مسح جميع المهام الظاهرة في هذه الفئة؟ لا يمكن التراجع عن هذا الإجراء.', 
            showInput: false, 
            confirmText: 'مسح المهام', 
            isDanger: true 
        });

        if (confirmed) {
            const items = todoList.querySelectorAll('.todo-item');
            items.forEach(item => item.classList.add('fadeOut'));
            
            setTimeout(() => {
                const nodeElements = todoList.querySelectorAll('.todo-item-wrapper');
                nodeElements.forEach(el => {
                    const id = el.dataset.id;
                    deleteNode(todos, id);
                });
                saveTodos();
                renderTodos();
            }, 300);
        }
    }

    function updateStatsAndProgress() {
        if (!currentCategoryFilter) {
            totalTasksEl.textContent = '0';
            completedTasksEl.textContent = '0';
            checkEmptyState(true);
            progressWrapper.classList.add('hidden');
            return;
        }

        let rootNodes = todos.filter(t => t.categoryId === currentCategoryFilter);
        
        const stats = getStats(rootNodes);
        totalTasksEl.textContent = stats.total;
        completedTasksEl.textContent = stats.completed;
        
        checkEmptyState(stats.total === 0);
        
        if (stats.total === 0) {
            progressWrapper.classList.add('hidden');
        } else {
            progressWrapper.classList.remove('hidden');
            const percent = Math.round((stats.completed / Math.max(stats.total, 1)) * 100);
            progressFill.style.width = `${percent}%`;
            progressPercent.textContent = `${percent}%`;
            
            if(percent === 100) {
                progressPercent.style.color = 'var(--success)';
                progressFill.style.background = 'var(--success)';
            } else {
                progressPercent.style.color = 'var(--primary)';
                progressFill.style.background = 'var(--primary-gradient)';
            }
        }
    }

    function checkEmptyState(isEmpty = false) {
        if (isEmpty) {
            emptyState.classList.remove('hidden');
        } else {
            emptyState.classList.add('hidden');
        }
    }

    // Utility
    function escapeHTML(str) {
        return str.replace(/[&<>'"]/g, 
            tag => ({
                '&': '&amp;',
                '<': '&lt;',
                '>': '&gt;',
                "'": '&#39;',
                '"': '&quot;'
            }[tag] || tag)
        );
    }

    // PWA Service Worker Registration
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('./sw.js')
            .catch(err => console.log('Service Worker Error: ', err));
    }
});
