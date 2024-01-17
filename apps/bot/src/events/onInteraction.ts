import { InteractionType as DInteractionType } from 'discord.js'
import CommandManager from '@managers/CommandManager'
import ErrorManager from '@managers/ErrorManager'
import InteractionManager from '@managers/InteractionManager'
import { Event } from '@structures/Event'
import { InteractionType } from '@utils/Constants'

export default new Event('interactionCreate', async (client, interaction) => {
  const commandManager = new CommandManager(client)
  const errorManager = new ErrorManager(client)
  const interactionManager = new InteractionManager(client)
  if (!interaction.inCachedGuild()) return

  if (interaction.isChatInputCommand()) {
    const command = commandManager.get(interaction.commandName)
    if (!command) return
    // const guildData = await client.db.guild.findFirst({
    //   where: {
    //     id: interaction.guild.id
    //   }
    // })
    // const userData = await client.db.user.findFirst({
    //   where: {
    //     id: interaction.user.id
    //   }
    // })
    const i18n = await client.i18n.changeLanguage(
      // userData?.lang ?? guildData?.lang
      'ko'
    )
    try {
      if (CommandManager.isSlash(command)) {
        command.slash
          ? await command.slash.execute(client, interaction, i18n)
          : await command.execute(client, interaction, i18n)
      }
      //await interaction.deferReply().catch(() => { })
    } catch (error: any) {
      errorManager.report(error, { executer: interaction, isSend: true })
    }
  } else if (interaction.isButton()) {
    const interactionData = interactionManager.get(interaction.customId)

    if (!interactionData) return
    if (interactionData.type !== InteractionType.Button) return

    try {
      interactionData.execute(client, interaction)
    } catch (error: any) {
      errorManager.report(error, { executer: interaction, isSend: true })
    }
  } else if (interaction.isAnySelectMenu()) {
    const interactionData = interactionManager.get(interaction.customId)

    if (!interactionData) return
    if (interactionData.type !== InteractionType.Select) return

    try {
      interactionData.execute(client, interaction)
    } catch (error: any) {
      errorManager.report(error, { executer: interaction, isSend: true })
    }
  } else if (
    interaction.isContextMenuCommand() ||
    interaction.isUserContextMenuCommand() ||
    interaction.isMessageContextMenuCommand()
  ) {
    const interactionData = interactionManager.get(interaction.commandName)

    if (!interactionData) return
    if (interactionData.type !== InteractionType.ContextMenu) return

    try {
      interactionData.execute(client, interaction)
    } catch (error: any) {
      errorManager.report(error, { executer: interaction, isSend: true })
    }
  } else if (interaction.type === DInteractionType.ModalSubmit) {
    const interactionData = interactionManager.get(interaction.customId)

    if (!interactionData) return
    if (interactionData.type !== InteractionType.Modal) return

    try {
      interactionData.execute(client, interaction)
    } catch (error: any) {
      errorManager.report(error, { executer: interaction, isSend: true })
    }
  } else if (
    interaction.type === DInteractionType.ApplicationCommandAutocomplete
  ) {
    const interactionData = interactionManager.get(interaction.commandName)

    if (!interactionData) return
    if (interactionData.type !== InteractionType.AutoComplete) return

    try {
      interactionData.execute(client, interaction)
    } catch (error: any) {
      errorManager.report(error)
    }
  }
})
