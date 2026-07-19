'use strict';

// Strings every linker plugin shows. A plugin's own locale wins over these, so a
// plugin that needs different wording just keeps its own key.

const en = {
  'modal.andMore': '…and {n} more',
  'btn.apply': 'Apply',
  'btn.cancel': 'Cancel',
  'set.heading.maintenance': 'Maintenance',
  'set.rebuild.button': 'Rebuild',
  'set.precedence.name': 'Priority among linker plugins',
  'set.precedence.desc': 'A word or link several linkers claim goes to the one highest in this list. You can only move this plugin — move the others from their own settings.',
  'set.precedence.other': 'Moved from its own settings',
  'set.precedence.up': 'Move up',
  'set.precedence.down': 'Move down',
};

const ru = {
  'modal.andMore': '…и ещё {n}',
  'btn.apply': 'Применить',
  'btn.cancel': 'Отмена',
  'set.heading.maintenance': 'Обслуживание',
  'set.rebuild.button': 'Перестроить',
  'set.precedence.name': 'Приоритет среди плагинов-линкеров',
  'set.precedence.desc': 'Слово или ссылку, на которые претендуют несколько линкеров, забирает тот, кто выше в списке. Отсюда двигается только этот плагин — остальные из своих настроек.',
  'set.precedence.other': 'Двигается из своих настроек',
  'set.precedence.up': 'Выше',
  'set.precedence.down': 'Ниже',
};

const de = {
  'modal.andMore': '…und {n} weitere',
  'btn.apply': 'Anwenden',
  'btn.cancel': 'Abbrechen',
  'set.heading.maintenance': 'Wartung',
  'set.rebuild.button': 'Neu aufbauen',
};

const es = {
  'modal.andMore': '…y {n} más',
  'btn.apply': 'Aplicar',
  'btn.cancel': 'Cancelar',
  'set.heading.maintenance': 'Mantenimiento',
  'set.rebuild.button': 'Reconstruir',
};

const fr = {
  'modal.andMore': '…et {n} de plus',
  'btn.apply': 'Appliquer',
  'btn.cancel': 'Annuler',
  'set.heading.maintenance': 'Maintenance',
  'set.rebuild.button': 'Reconstruire',
};

const uk = {
  'modal.andMore': '…та ще {n}',
  'btn.apply': 'Застосувати',
  'btn.cancel': 'Скасувати',
  'set.heading.maintenance': 'Обслуговування',
  'set.rebuild.button': 'Перебудувати',
};

module.exports = { en, ru, de, es, fr, uk };
