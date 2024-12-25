import "./monacoedit";
import {editor} from 'monaco-editor';
import { fnsToTernaries, getAllTypeConditionalDeclarations, ternaryToFn } from './agnostic';

const config: editor.IStandaloneEditorConstructionOptions = {
  fontSize: 20,
  language: 'typescript',
  theme: 'vs-dark',
  minimap: { enabled: false },
}

const left = editor.create(document.getElementById('left') as HTMLElement, {
  value: 'type A<T> = T extends string ? true : false;',
  ...config
});

let isUpdating = false;
left.onDidChangeModelContent(() =>  updateLeft());




function updateLeft() {
  if(!isUpdating) {
    isUpdating = true;
    const value = left.getModel()?.getValue() ?? '';
    try {
    const fns = getAllTypeConditionalDeclarations(value).map(fn => ternaryToFn(fn));
      right.setValue(fns.join('\n\n'));  
    } catch(e: any) {
      right.setValue('//' + e.message);
    }
    isUpdating = false;
  }
}


const right = editor.create(document.getElementById('right') as HTMLElement, {
  value: 'type B<T> = T extends string ? true : false;',
  ...config
})

updateLeft();
right.onDidChangeModelContent(() => {
  if(!isUpdating) {
    isUpdating = true;
    try {
    const value = right.getModel()?.getValue() ?? '';
    const ternaries = fnsToTernaries(value);
    left.setValue(ternaries);
    } catch(e: any) {
      left.setValue('//' + e.message);
    }
    isUpdating = false;
  }
});

editor.onDidChangeMarkers(() => {
editor.setModelMarkers(right.getModel()!, 'typescript', []);

});
