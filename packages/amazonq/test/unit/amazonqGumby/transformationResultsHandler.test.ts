/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import assert from 'assert'
import sinon from 'sinon'
import fs from 'fs-extra'
import os from 'os'
import { DiffModel, AddedChangeNode, ModifiedChangeNode } from 'aws-core-vscode/codewhisperer'
import path from 'path'
import { getTestResourceFilePath } from './amazonQGumbyUtil'

describe('DiffModel', function () {
    afterEach(() => {
        sinon.restore()
    })

    it('WHEN parsing a diff patch where a file was added THEN returns an array representing the added file', async function () {
        const testDiffModel = new DiffModel()

        const workspacePath = 'workspace'

        sinon.replace(fs, 'existsSync', (path) => {
            const pathStr = path.toString()
            if (pathStr.includes(workspacePath)) {
                return false
            }

            return true
        })

        testDiffModel.parseDiff(getTestResourceFilePath('resources/files/addedFile.diff'), workspacePath)

        assert.strictEqual(testDiffModel.changes.length, 1)
        const change = testDiffModel.changes[0]

        assert.strictEqual(change instanceof AddedChangeNode, true)
    })

    it('WHEN parsing a diff patch where a file was modified THEN returns an array representing the modified file', async function () {
        const testDiffModel = new DiffModel()

        const workspacePath = os.tmpdir()

        sinon.replace(fs, 'existsSync', (path) => true)

        fs.writeFileSync(
            path.join(workspacePath, 'README.md'),
            'This guide walks you through using Gradle to build a simple Java project.'
        )

        testDiffModel.parseDiff(getTestResourceFilePath('resources/files/modifiedFile.diff'), workspacePath)

        assert.strictEqual(testDiffModel.changes.length, 1)
        const change = testDiffModel.changes[0]

        assert.strictEqual(change instanceof ModifiedChangeNode, true)

        fs.rmSync(path.join(workspacePath, 'README.md'))
    })
})
