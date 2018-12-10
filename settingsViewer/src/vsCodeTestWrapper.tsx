import * as React from 'react';
import * as ReactDOM from 'react-dom';
import {observable} from 'mobx';
import {observer} from 'mobx-react';
import { isUpdateCounterMessage } from './message';
import { channelName } from './vscode/vscodeAPI';

class AppState {
  @observable counter = 0;
}

@observer
class VsCodeTestWrapperView extends React.Component<{appState: AppState}, {}> {
    render() {
        const appState = this.props.appState;
        return (
            <div>
              {appState.counter}
            </div>
        );
     }
}

const appState = new AppState();
ReactDOM.render(<VsCodeTestWrapperView appState={appState} />, document.getElementById('root'));

const channel = new BroadcastChannel(channelName);

channel.onmessage = event => {
    const message = event.data;

    if (isUpdateCounterMessage(message)) {
        appState.counter = message.value;
    }
};