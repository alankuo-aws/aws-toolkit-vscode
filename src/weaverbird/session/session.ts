/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'path'
import { getLogger } from '../../shared/logger/logger'
import { collectFiles } from '../util/files'
import { CodeGenState, RefinementState } from './sessionState'
import type { Interaction, SessionState, SessionStateConfig } from '../types'
import { AddToChat } from '../models'
import { SessionConfig } from './sessionConfig'
import { ConversationIdNotFoundError } from '../errors'

export class Session {
    private _state: SessionState
    private task: string = ''
    private approach: string = ''
    public readonly config: SessionConfig

    private addToChat: AddToChat

    constructor(sessionConfig: SessionConfig, addToChat: AddToChat) {
        this.config = sessionConfig
        this._state = new RefinementState(this.getSessionStateConfig(), '')

        this.addToChat = addToChat
    }

    async send(msg: string): Promise<Interaction[]> {
        try {
            getLogger().info(`Received message from chat view: ${msg}`)
            return await this.sendUnsafe(msg)
        } catch (e: any) {
            getLogger().error(e)
            return [
                {
                    origin: 'ai',
                    type: 'message',
                    content: `Received error: ${e.code} and status code: ${e.statusCode} [${e.message}] when trying to send the request to the Weaverbird API`,
                },
            ]
        }
    }

    private getSessionStateConfig(): Omit<SessionStateConfig, 'conversationId'> {
        return {
            client: this.config.client,
            llmConfig: this.config.llmConfig,
            workspaceRoot: this.config.workspaceRoot,
            backendConfig: this.config.backendConfig,
        }
    }

    /**
     * Triggered by the Write Code follow up button to start the code generation phase
     */
    async startCodegen(): Promise<void> {
        if (!this.state.conversationId) {
            throw new ConversationIdNotFoundError()
        }

        this._state = new CodeGenState(
            {
                ...this.getSessionStateConfig(),
                conversationId: this.state.conversationId,
            },
            this.approach
        )
        await this.nextInteraction(undefined)
    }

    async sendUnsafe(msg: string): Promise<Interaction[]> {
        const sessionStageConfig = this.getSessionStateConfig()

        if (msg === 'CLEAR') {
            this.task = ''
            this.approach = ''
            this._state = new RefinementState(sessionStageConfig, this.approach)
            const message =
                'Finished the session for you. Feel free to restart the session by typing the task you want to achieve.'
            return [
                {
                    origin: 'ai',
                    type: 'message',
                    content: message,
                },
            ]
        }

        // When the task/"thing to do" hasn't been set yet, we want it to be the incoming message
        if (this.task === '') {
            this.task = msg
        }

        return this.nextInteraction(msg)
    }

    private async nextInteraction(msg: string | undefined) {
        const files = await collectFiles(path.join(this.config.workspaceRoot, 'src'))

        const resp = await this.state.interact({
            files,
            task: this.task,
            msg,
            fs: this.config.fs,
            addToChat: this.addToChat,
        })

        if (resp.nextState) {
            // Approach may have been changed after the interaction
            const newApproach = this.state.approach

            // Cancel the request before moving to a new state
            this.state.tokenSource.cancel()

            // Move to the next state
            this._state = resp.nextState

            // If approach was changed then we need to set it in the next state and this state
            this.state.approach = newApproach
            this.approach = newApproach
        }

        return resp.interactions
    }

    get state() {
        return this._state
    }
}
