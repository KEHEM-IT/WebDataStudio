import type { LibrarySignature } from '@types/detection';

/** Class/attribute fingerprints for popular grid & table libraries.
 *  Order matters — more specific signatures are checked first. */
const SIGNATURES: Array<{ lib: LibrarySignature; test: (el: Element) => boolean }> = [
  { lib: 'ag-grid', test: (el) => !!el.closest('.ag-root, .ag-root-wrapper') },
  { lib: 'tabulator', test: (el) => !!el.closest('.tabulator') },
  { lib: 'handsontable', test: (el) => !!el.closest('.handsontable') },
  { lib: 'kendo-grid', test: (el) => !!el.closest('.k-grid') },
  { lib: 'datatables', test: (el) => !!el.closest('table.dataTable, .dataTables_wrapper') },
  { lib: 'bootstrap-table', test: (el) => !!el.closest('.bootstrap-table') },
  { lib: 'primevue', test: (el) => !!el.closest('.p-datatable') },
  { lib: 'vuetify', test: (el) => !!el.closest('.v-data-table') },
  { lib: 'element-plus', test: (el) => !!el.closest('.el-table') },
  { lib: 'antd', test: (el) => !!el.closest('.ant-table') },
  { lib: 'mui', test: (el) => !!el.closest('.MuiDataGrid-root, .MuiTable-root') }
];

export function detectLibrary(el: Element): LibrarySignature {
  for (const sig of SIGNATURES) {
    if (sig.test(el)) return sig.lib;
  }
  return 'native';
}
