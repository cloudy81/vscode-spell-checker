import * as CSpellSettings from './settings/CSpellSettings';
import * as Settings from './settings';
import { resolveTarget, determineSettingsPath } from './settings';

import { window, TextEditor, Uri, workspace, commands, WorkspaceEdit, TextDocument, Range } from 'vscode';
import {
    TextEdit, LanguageClient,
} from 'vscode-languageclient';
import { SpellCheckerSettingsProperties } from './server';
import * as di from './di';

export { toggleEnableSpellChecker, enableCurrentLanguage, disableCurrentLanguage } from './settings';

export function handlerApplyTextEdits(client: LanguageClient) {
    return async function applyTextEdits(uri: string, documentVersion: number, edits: TextEdit[]): Promise<void> {

        const textEditor = window.activeTextEditor;
        if (textEditor && textEditor.document.uri.toString() === uri) {
            if (textEditor.document.version !== documentVersion) {
                window.showInformationMessage('Spelling changes are outdated and cannot be applied to the document.');
            }
            const propertyFixSpellingWithRenameProvider: SpellCheckerSettingsProperties = 'fixSpellingWithRenameProvider';
            const cfg = workspace.getConfiguration(Settings.sectionCSpell);
            if (cfg.get(propertyFixSpellingWithRenameProvider) && edits.length === 1) {
                console.log(`${propertyFixSpellingWithRenameProvider} Enabled`);
                const edit = edits[0];
                const range = client.protocol2CodeConverter.asRange(edit.range);
                if (await attemptRename(textEditor.document, range, edit.newText)) {
                    return;
                }
            }

            textEditor.edit(mutator => {
                for (const edit of edits) {
                    mutator.replace(client.protocol2CodeConverter.asRange(edit.range), edit.newText);
                }
            }).then((success) => {
                if (!success) {
                    window.showErrorMessage('Failed to apply spelling changes to the document.');
                }
            });
        }
    };
}

async function attemptRename(document: TextDocument, range: Range, text: string): Promise<boolean | undefined> {
    if (range.start.line !== range.end.line) {
        return false;
    }
    const wordRange = document.getWordRangeAtPosition(range.start);
    if (!wordRange || !wordRange.contains(range)) {
        return false;
    }
    const orig = wordRange.start.character;
    const a = range.start.character - orig;
    const b = range.end.character - orig;
    const docText = document.getText(wordRange);
    const newText = [docText.slice(0, a), text, docText.slice(b)].join('');
    const workspaceEdit = await commands.executeCommand(
        'vscode.executeDocumentRenameProvider',
        document.uri,
        range.start,
        newText
    ).then(
        a => a as (WorkspaceEdit | undefined),
        reason => (console.log(reason), undefined)
    );
    return workspaceEdit && workspaceEdit.size > 0 && await workspace.applyEdit(workspaceEdit);
}

export function addWordToFolderDictionary(word: string, uri: string | null | Uri | undefined): Thenable<void> {
    return addWordToTarget(word, Settings.Target.WorkspaceFolder, uri);
}

export function addWordToWorkspaceDictionary(word: string, uri: string | null | Uri | undefined): Thenable<void> {
    return addWordToTarget(word, Settings.Target.Workspace, uri);
}

export function addWordToUserDictionary(word: string): Thenable<void> {
    return addWordToTarget(word, Settings.Target.Global, undefined);
}

function addWordToTarget(word: string, target: Settings.Target, uri: string | null | Uri | undefined) {
    return di.dependencies.dictionaryHelper.addWordToTarget(word, target, uri);
}

export async function addIgnoreWordToTarget(
    word: string,
    target: Settings.Target,
    uri: string | null | Uri | undefined
): Promise<void> {
    const actualTarget = resolveTarget(target, uri);
    await Settings.addIgnoreWordToSettings(actualTarget, word);
    const paths = await determineSettingsPath(actualTarget, uri);
    await Promise.all(paths.map(path => CSpellSettings.addIgnoreWordToSettingsAndUpdate(path, word)));
}

export function removeWordFromFolderDictionary(word: string, uri: string | null | Uri | undefined): Thenable<void> {
    return removeWordFromTarget(word, Settings.Target.WorkspaceFolder, uri);
}

export function removeWordFromWorkspaceDictionary(word: string, uri: string | null | Uri | undefined): Thenable<void> {
    return removeWordFromTarget(word, Settings.Target.Workspace, uri);
}

export function removeWordFromUserDictionary(word: string): Thenable<void> {
    return removeWordFromTarget(word, Settings.Target.Global, undefined);
}

async function removeWordFromTarget(word: string, target: Settings.Target, uri: string | null | Uri | undefined) {
    const actualTarget = resolveTarget(target, uri);
    await Settings.removeWordFromSettings(actualTarget, word);
    const paths = await determineSettingsPath(actualTarget, uri);
    await Promise.all(paths.map(path => CSpellSettings.removeWordFromSettingsAndUpdate(path, word)));
}

export function enableLanguageId(languageId: string, uri?: string): Promise<void> {
    return Settings.enableLanguageIdForClosestTarget(languageId, true, uri ? Uri.parse(uri) : undefined);
}

export function disableLanguageId(languageId: string, uri?: string): Promise<void> {
    return Settings.enableLanguageIdForClosestTarget(languageId, false, uri ? Uri.parse(uri) : undefined);
}

export function userCommandOnCurrentSelectionOrPrompt(
    prompt: string,
    fnAction: (text: string, uri: Uri | undefined) => Thenable<void>
): () => Thenable<void> {
    return function () {
        const { activeTextEditor = {} } = window;
        const { selection, document } = activeTextEditor as TextEditor;
        const range = selection && document ? document.getWordRangeAtPosition(selection.active) : undefined;
        const value = range ? document.getText(selection) || document.getText(range) : selection && document.getText(selection) || '';
        return (selection && !selection.isEmpty)
            ? fnAction(value, document && document.uri)
            : window.showInputBox({prompt, value}).then(word => { word && fnAction(word, document && document.uri); });
    };
}
