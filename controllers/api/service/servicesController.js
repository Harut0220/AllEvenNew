import moment from "moment-timezone";
import companyModel from "../../../models/company/companyModel.js";
import servicesRegistrations from "../../../models/services/servicesRegistrations.js";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import CompanyServiceModel from "../../../models/company/companyService.js";
import notifEvent from "../../../events/NotificationEvent.js";
import schedule from "node-schedule";
import companyHotDealRegistrations from "../../../models/company/companyHotDealRegistration.js";
import Notification from "../../../models/Notification.js";
import User from "../../../models/User.js";
import ServicePays from "../../../models/company/companyPays.js";
import companyCategory from "../../../models/company/companyCategory.js";
import companyHotDeals from "../../../models/company/companyHotDeals.js";
const { ObjectId } = mongoose.Types;

const servicesController = {
  editRegisterUser: async (req, res) => {
    try {
      const { id, text } = req.body;
      // const updatedRegister = await servicesRegistrations.findById(id);
      // updatedRegister.messages.unshift(text);
      // await updatedRegister.save();
      const updatedDoc = await servicesRegistrations
        .findByIdAndUpdate(
          id,
          {
            $push: { messages: { $each: [text], $position: 0 } },
          },
          { new: true } // Return the updated document
        )
        .populate({
          path: "user",
          select: "name surname avatar phone_number",
        })
        .populate({
          path: "serviceId",
          select: "type images description cost",
        })
        .lean();
      res.status(200).send({ message: "success", data: updatedDoc });
    } catch (error) {
      console.error(error);
      res.status(500).send({ message: "Server Error" });
    }
  },
  myRegisters: async (req, res) => {
    const authHeader = req.headers.authorization;
    const token = authHeader.split(" ")[1];
    const user = jwt.decode(token);
    const companyCategoryDb = await companyCategory.find();
    const result = [];
    for (let i = 0; i < companyCategoryDb.length; i++) {
      const obj = {};
      obj._id = companyCategoryDb[i]._id;
      obj.name = companyCategoryDb[i].name;
      obj.avatar = companyCategoryDb[i].avatar;
      const registersDb = await servicesRegistrations.find({
        user: user.id,
        category: companyCategoryDb[i]._id,
      });
      obj.registers = registersDb;
      result.push(obj);
    }
    const dateNow = moment.tz(process.env.TZ).format("YYYY-MM-DD HH:mm");

    for (let z = 0; z < result.length; z++) {
      for (let x = 0; x < result[i].registers; x++) {
        if (!(result[i].registers[x].date > dateNow)) {
          result[i].registers[x].status = 3;
        }
      }
    }

    res.status(200).send({ message: "success", data: result });
  },
  confirmPay: async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      const token = authHeader.split(" ")[1];
      const user = jwt.decode(token);
      const { id } = req.body;
      const registerDb = await servicesRegistrations.findById(id);
      const service = await CompanyServiceModel.findById(
        registerDb.serviceId.toString()
      );
      const prepaymentPrice = (service.cost * 10) / 100;
      const servicePay = new ServicePays({
        user: user.id,
        service: registerDb.serviceId,
        registerId: id,
        prepayment: true,
        prepaymentPrice: prepaymentPrice,
        paymentPrice: service.cost,
      });

      await servicePay.save();
      res.status(200).send({ message: "success", data: servicePay });
    } catch (error) {
      console.error(error);
    }
  },
  freeTimes: async (req, res) => {
    const { id, date } = req.query;

    const serviceDb = await CompanyServiceModel.findById(id);

    const companyDb = await companyModel.findById(serviceDb.companyId);

    const daysFunc = (daysDb) => {
      if (daysDb === "Пн․- Пят․") {
        return ["понедельник", "вторник", "среда", "четверг", "пятница"];
      } else if (daysDb === "Пн․- Сб.") {
        return [
          "понедельник",
          "вторник",
          "среда",
          "четверг",
          "пятница",
          "суббота",
        ];
      } else if (daysDb === "Суб․- Вс․") {
        return ["суббота", "воскресенье"];
      } else if (daysDb === "Вт․- Вс․") {
        return [
          "вторник",
          "среда",
          "четверг",
          "пятница",
          "суббота",
          "воскресенье",
        ];
      } else if (daysDb === "Пн․- Чт․") {
        return ["понедельник", "вторник", "среда", "четверг"];
      }
    };

    const dayName = moment
      .tz(date, "YYYY-MM-DD", process.env.TZ)
      .locale("ru")
      .format("dddd");

    const workingDays = daysFunc(companyDb.days);

    const ifTodayWorking = workingDays.includes(dayName);

    if (!ifTodayWorking) {
      return res.status(200).send({ message: "выходной день", data: [] });
    }

    const startTime = moment.tz(
      `${date} ${companyDb.startHour}`,
      "YYYY-MM-DD HH:mm",
      process.env.TZ
    );
    const endTime = moment.tz(
      `${date} ${companyDb.endHour}`,
      "YYYY-MM-DD HH:mm",
      process.env.TZ
    );
    let isNight = false;

    const times = [];
    let currentTime = startTime.clone();

    while (currentTime <= endTime) {
      times.push(currentTime.format("YYYY-MM-DD HH:mm"));
      currentTime.add(1, "hour");

      if (currentTime.format("HH:mm") === endTime.format("HH:mm")) {
        break;
      }
    }

    while (currentTime >= endTime) {
      if (currentTime.format("HH:mm") === endTime.format("HH:mm")) {
        break;
      }
      isNight = true;

      times.push(currentTime.format("YYYY-MM-DD HH:mm"));
      currentTime.add(1, "hour");
    }

    while (currentTime === endTime) {
      times.push(currentTime.format("YYYY-MM-DD HH:mm"));
      currentTime.add(1, "hour");
      if (currentTime.format("HH:mm") === endTime.format("HH:mm")) {
        break;
      }
    }

    const freeTimes = [];
    let arr = [];

    for (let i = 0; i < times.length; i++) {
      const datTimes = `${date}${times[i].slice(10, 16)}`;

      const registerDb = await servicesRegistrations.findOne({
        serviceId: id,
        date: datTimes,
      });

      //      date: { $gt: afterDate } // $gt = "greater than"

      const sliceDate = times[i].slice(8, 10);
      const sliceDateReq = date.slice(8, 10);
      if (!registerDb && sliceDate === sliceDateReq) {
        freeTimes.push(times[i]);
      } else if (!registerDb && !(sliceDate === sliceDateReq)) {
        const dateTimeSliceDay = `${date} ${times[i].slice(11, 16)}`;

        arr.push(dateTimeSliceDay);
      }
    }
    for (let j = arr.length - 1; j >= 0; j--) {
      freeTimes.unshift(arr[j]);
    }

    // const hours = [];
    // freeTimes.forEach(time => {
    //   hours.push(time.slice(11, 16));
    // });
    //,isNight
    const dateNow = moment.tz(process.env.TZ).format("YYYY-MM-DD HH:mm");

    let availableTimes = freeTimes;
    console.log(dateNow, "dateNow");
    console.log(date, "date");
    const dateDay=dateNow.slice(0,10)
    console.log(dateDay,"dateDay");
    

    if (dateDay === date) {
      availableTimes = freeTimes.filter((time) =>
        moment.tz(time, "YYYY-MM-DD HH:mm", process.env.TZ).isAfter(dateNow)
      );
    }

    res
      .status(200)
      .send({ success: true, message: "success", data: availableTimes });
  },
  times: async (req, res) => {
    const { serviceId, today } = req.query;
    const serviceRegister = await servicesRegistrations.find({
      serviceId,
      date: { $regex: `^${today}` },
    });
    const service = await CompanyServiceModel.findById(
      serviceRegister[0].serviceId
    );
    const companie = await companyModel.findById(service[0].companyId);
    const result = {
      startHour: service.startHour,
      endHour: service.endHour,
      days: service.days,
      company: companie,
    };
    res.status(200).send({ success: true, data: result });
  },
  edite: async (req, res) => {
    const data = req.body;

    const updatedCompany = await CompanyServiceModel.findByIdAndUpdate(
      data._id,
      { ...data, updatedAt: moment.tz(process.env.TZ).format() },
      { new: true }
    );
    res.status(200).send({ success: true, data: updatedCompany });
  },
  near: async (req, res) => {
    const id = req.params.id;
    const dbResult = await CompanyServiceModel.findById(id);
    res.status(200).send({ message: "success", data: dbResult });
  },
  registers: async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      const { companyId } = req.params;
      const { day } = req.query;

      if (!companyId && !day) {
        res.status(404).send({ message: "companyId & day not found" });
      }

      const token = authHeader.split(" ")[1];
      const user = jwt.decode(token);
      // const user = { id: "656ecb2e923c5a66768f4cd3" };
      const company = await companyModel
        .findById(companyId)
        .populate("hotDeals");
      const resObj = {};
      const resToday = [];
      const inFuture = [];
      const inPast = [];
      const objectIdArray = company.services.map((id) => ObjectId(id));
      const dbResult = await servicesRegistrations
        .find({ serviceId: { $in: objectIdArray } })
        .populate({
          path: "user",
          select: "name surname avatar phone_number",
        })
        .populate("serviceId")
        .exec();

      const formattedDate = moment.tz(process.env.TZ).format("YYYY-MM-DD");

      /////////////////////////////////////////////////////////
      function checkDateStatus(givenDateString) {
        const givenDate = new Date(givenDateString);

        if (isNaN(givenDate.getTime())) {
          throw new Error("Invalid date format");
        }

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        givenDate.setHours(0, 0, 0, 0);

        if (givenDate < today) {
          return "The given date is in the past.";
        } else if (givenDate > today) {
          return "future";
        } else {
          return "today";
        }
      }

      // Example usage
      if (dbResult.length !== 0) {
        for (let i = 0; i < dbResult.length; i++) {
          // const dateToCheck = '2024-08-13';
          // const dateToCheck = '2024-08-12';
          try {
            const status = checkDateStatus(dbResult[i].date);
            if (status === "today") {
              resToday.push(dbResult[i]);
            } else if (status === "future") {
              inFuture.push(dbResult[i]);
            } else if (status === "The given date is in the past.") {
              // inPast.push(dbResult[i]);
            }
          } catch (error) {
            console.error(error.message);
          }
        }
        resObj.inFuture = inFuture;
        resObj.resToday = resToday;
        resObj.inPast = inPast;
        ////////////////////////////////////////////////////////
      }

      // if (!resObj.inFuture && !resObj.resToday && !resObj.inPast) {
      //   res.status(200).send({ message: "у вас нет постов" });
      // } else {
      const resObject = {};
      if (day === "today") {
        const dealsRegisters = [];
        for (let i = 0; i < company.hotDeals.length; i++) {
          const register = await companyHotDealRegistrations
            .find({
              dealId: company.hotDeals[i]._id,
            })
            .populate({
              path: "user",
              select: "name surname avatar phone_number",
            });
          if (register) {
            dealsRegisters.push(register);
          }
        }
        if (resToday.length) {
          resToday.sort((a, b) => b.dateSlice - a.dateSlice);
          const resArray = [];
          for (let i = 0; i < resToday.length; i++) {
            // if (i>0){
            // if(resToday[i].dateSlice===resToday[i-1].dateSlice){
            resArray.push(resToday[i]);
            // }
            // }
          }
          resObject[resToday[0].dateSlice] = resArray;

          res
            .status(200)
            .send({ message: "success", data: resObject, dealsRegisters });
        } else {
          res
            .status(200)
            .send({ message: "success", data: resToday, dealsRegisters });
        }
      } else if (day === "future") {
        if (inFuture.length) {
          inFuture.sort((a, b) => b.dateSlice - a.dateSlice);
          for (let i = 0; i < inFuture.length; i++) {
            resObject[inFuture[i].dateSlice] = [];
          }
          for (let z = 0; z < inFuture.length; z++) {
            resObject[inFuture[z].dateSlice].push(inFuture[z]);
          }
          res.status(200).send({ message: "success", data: resObject });
        } else {
          res.status(200).send({ message: "success", data: inFuture });
        }
      }
      // }
    } catch (error) {
      console.error(error);
    }
  },
  editeRegistr: async (req, res) => {
    try {
      const { id, date, text } = req.body;
      console.log(date, "date update");

      const daySlice = date.slice(8, 10);
      const monthSlice = date.slice(5, 7);
      const dateSlice = `${monthSlice}.${daySlice}`;

      if (date && text && id) {
        const service = await servicesRegistrations
          .findById(id)
          .populate("serviceId")
          .populate("user");
        if (text) {
          service.dealDate = date;
          service.dateSlice = dateSlice;
          service.messages.unshift(text);
          await service.save();
        } else {
          service.dateSlice = dateSlice;

          service.dealDate = date;
          await service.save();
        }

        const evLink = `alleven://companyDetail/${service._id}`;

        const dataNotif = {
          status: 2,
          date_time: moment.tz(process.env.TZ).format("YYYY-MM-DD HH:mm"),
          user: service.user._id.toString(),
          type: "Предлагают перенести",
          message: `Услугу ${service.serviceId.type} на которую вы записались предлагают перенести на ${date}`,
          createId: service.serviceId._id,
          categoryIcon: service.serviceId.images[0],
          link: evLink,
        };
        const nt = new Notification(dataNotif);
        await nt.save();
        if (service.user.notifCompany) {
          notifEvent.emit(
            "send",
            service.user._id.toString(),
            JSON.stringify({
              type: "Предлагают перенести",
              date_time: moment.tz(process.env.TZ).format("YYYY-MM-DD HH:mm"),
              createId: service.serviceId._id,
              message: `Услугу ${service.serviceId.type} на которую вы записались предлагают перенести на ${date}`,
              service: service._id,
              categoryIcon: service.serviceId.images[0],
              link: evLink,
            })
          );
        }

        const updatedRegister = await servicesRegistrations
          .findById(id)
          .populate({
            path: "user",
            select: "name surname avatar phone_number",
          })
          .populate({
            path: "serviceId",
            select: "type images description cost",
          })
          .lean();
        res.status(200).send({ message: "success", data: updatedRegister });
      } else {
        res.status(400).send({ message: "id, date, text is required" });
      }
    } catch (error) {
      console.error(error);
    }
  },
  // editeService: async (req, res) => {
  //   try {
  //     const { serviceId } = req.body;
  //   } catch (error) {
  //     console.error(error);
  //   }
  // },
  confirm: async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      const token = authHeader.split(" ")[1];
      const user = jwt.decode(token);

      const { id } = req.body;

      const service = await servicesRegistrations
        .findOneAndUpdate(
          { _id: id }, // Filter criteria
          { $set: { status: 1 } }, // Update action
          { new: true } // Return the updated document
        )
        .populate({
          path: "user",
          select: "_id name surname avatar phone_number",
        })
        .populate({ path: "serviceId", select: "_id type" })
        .exec();
      const serviceDb = await CompanyServiceModel.findById(
        service.serviceId._id
      );
      await companyModel.findByIdAndUpdate(serviceDb.companyId, {
        $push: { participants: service.user._id },
      });
      const daySlice = service.date.slice(8, 10);
      const monthSlice = service.date.slice(5, 7);
      const dateSlice = `${monthSlice}.${daySlice}`;

      const confirmedRegister = await servicesRegistrations
        .findOneAndUpdate(
          { _id: id },
          { $set: { dateSlice, date: service.dealDate } },
          { new: true }
        )
        .select("-dealDate")
        .populate({
          path: "user",
          select: "_id name surname avatar phone_number notifCompany",
        })
        .populate({
          path: "serviceId",
          select: "_id type images cost companyId description serviceRegister",
        })
        .exec();
      const time = confirmedRegister.date.split(" ")[1];
      const evLink = `alleven://companyDetail/${confirmedRegister.serviceId._id}`;
      if (user.id === service.user._id.toString()) {
        const companyDb = await companyModel
          .findById(confirmedRegister.serviceId.companyId.toString())
          .populate("owner")
          .exec();
        const dataNotif = {
          status: 2,
          date_time: moment.tz(process.env.TZ).format("YYYY-MM-DD HH:mm"),
          user: companyDb.owner._id.toString(),
          type: "Регистрации услугу",
          message: `Пользователь пoтвердил ваше предложение на услугу ${confirmedRegister.serviceId.type} время ${confirmedRegister.date}`,
          createId: confirmedRegister.serviceId._id,
          cotegoryIcon: confirmedRegister.serviceId.images[0],
          link: evLink,
        };
        const nt = new Notification(dataNotif);
        await nt.save();
        if (companyDb.owner.notifCompany) {
          notifEvent.emit(
            "send",
            companyDb.owner._id.toString(),
            JSON.stringify({
              type: "Регистрации услугу",
              createId: confirmedRegister.serviceId._id,
              date_time: moment.tz(process.env.TZ).format("YYYY-MM-DD HH:mm"),
              message: `Пользователь пoтвердил ваше предложение на услугу ${confirmedRegister.serviceId.type} время ${confirmedRegister.date}`,
              service: confirmedRegister.serviceId._id,
              cotegoryIcon: confirmedRegister.serviceId.images[0],
              link: evLink,
            })
          );
        }
      } else {
        const dataNotif = {
          status: 2,
          date_time: moment.tz(process.env.TZ).format("YYYY-MM-DD HH:mm"),
          user: confirmedRegister.user._id.toString(),
          type: "Регистрации услугу",
          message: `Организатор пoтвердил ваша запис на услугу ${confirmedRegister.serviceId.type} время ${confirmedRegister.date}`,
          createId: confirmedRegister.serviceId._id,
          cotegoryIcon: confirmedRegister.serviceId.images[0],
          link: evLink,
        };
        const nt = new Notification(dataNotif);
        await nt.save();
        if (confirmedRegister.user.notifCompany) {
          notifEvent.emit(
            "send",
            confirmedRegister.user._id.toString(),
            JSON.stringify({
              type: "Регистрации услугу",
              createId: confirmedRegister.serviceId._id,
              date_time: moment.tz(process.env.TZ).format("YYYY-MM-DD HH:mm"),
              message: `Организатор пoтвердил ваша запис на услугу ${confirmedRegister.serviceId.type} время ${confirmedRegister.date}`,
              service: confirmedRegister.serviceId._id,
              cotegoryIcon: confirmedRegister.serviceId.images[0],
              link: evLink,
            })
          );
        }
      }

      const dat = confirmedRegister.date;

      const registerTime = moment.tz(dat, process.env.TZ);
      const registerTimeFive = registerTime.clone().subtract(5, "minute");

      const notificationTime = registerTime.clone().subtract(1, "hour");

      const currentTime = moment.tz(process.env.TZ).format();
      async function sendMessage(serviceRegisterDbId, type) {
        try {
          const registerDb = await servicesRegistrations
            .findById(serviceRegisterDbId)
            .populate("serviceId")
            .populate("user")
            .exec();

          if (registerDb) {
            const evLink = `alleven://companyDetail/${registerDb.serviceId._id}`;
            const message = `Вы записались на услугу ${registerDb.serviceId.type} сегодня в ${time}`;

            const dataNotif = {
              status: 2,
              date_time: moment.tz(process.env.TZ).format("YYYY-MM-DD HH:mm"),
              user: registerDb.user._id.toString(),
              type: "Регистрация на услугу",
              message: message,
              createId: registerDb.serviceId._id,
              categoryIcon: registerDb.serviceId.images[0],
              link: evLink,
            };
            const nt = new Notification(dataNotif);
            await nt.save();
            if (registerDb.user.notifCompany) {
              notifEvent.emit(
                "send",
                registerDb.user._id.toString(),
                JSON.stringify({
                  type: "Регистрация на услугу",
                  createId: registerDb.serviceId._id,
                  date_time: moment
                    .tz(process.env.TZ)
                    .format("YYYY-MM-DD HH:mm"),
                  message: message,
                  categoryIcon: registerDb.serviceId.images[0],
                  link: evLink,
                })
              );
            }
          }
        } catch (error) {
          console.error("Error in sendMessage:", error);
        }
      }
      // async function sendMessage(serviceRegisterDbId, type) {

      //   const registerDb = await servicesRegistrations
      //     .findById(serviceRegisterDbId)
      //     .populate("serviceId")
      //     .populate("user")
      //     .exec();

      //   if (registerDb) {
      //     const evLink = `alleven://companyDetail/${registerDb.serviceId._id}`;

      //     if (type) {

      //       const dataNotif = {
      //         status: 2,
      //         date_time: moment.tz(process.env.TZ).format("YYYY-MM-DD HH:mm"),
      //         user: registerDb.user._id.toString(),
      //         type: "Регистрация на услугу",
      //         message: `Вы записались на услугу ${registerDb.serviceId.type} сегодня в ${registerDb.date}`,
      //         service: registerDb.serviceId._id,
      //         link: evLink,
      //       };
      //       const nt = new Notification(dataNotif);
      //       await nt.save();
      //       notifEvent.emit(
      //         "send",
      //         registerDb.user._id.toString(),
      //         JSON.stringify({
      //           type: "Регистрация на услугу",
      //           date_time: moment.tz(process.env.TZ).format("YYYY-MM-DD HH:mm"),
      //           message: `Вы записались на услугу ${registerDb.serviceId.type} сегодня в ${registerDb.date}`,
      //           link: evLink,
      //         })
      //       );

      //     } else {

      //       const dataNotif = {
      //         status: 2,
      //         date_time: moment.tz(process.env.TZ).format("YYYY-MM-DD HH:mm"),
      //         user: registerDb.user._id.toString(),
      //         type: "Регистрация на услугу",
      //         message: `Вы записались на услугу ${registerDb.serviceId.type} сегодня в ${registerDb.date}.`,
      //         service: registerDb.serviceId._id,
      //         link: evLink,
      //       };
      //       const nt = new Notification(dataNotif);
      //       await nt.save();
      //       notifEvent.emit(
      //         "send",
      //         registerDb.user._id.toString(),
      //         JSON.stringify({
      //           type: "Регистрация на услугу",
      //           date_time: moment.tz(process.env.TZ).format("YYYY-MM-DD HH:mm"),
      //           message: `Вы записались на услугу ${registerDb.serviceId.type} сегодня в ${registerDb.date}.`,
      //           link: evLink,
      //         })
      //       );

      //     }
      //   }
      // }

      schedule.scheduleJob(
        `notification_${confirmedRegister._id}_hour`,
        notificationTime.toDate(),
        () => {
          console.log("Notification Time hour before the event (schedule)");
          try {
            sendMessage(confirmedRegister._id.toString(), "hour");
          } catch (error) {
            console.error("Error sending notification (1 hour):", error);
          }
        }
      );

      schedule.scheduleJob(
        `notification_${confirmedRegister._id}_five`,
        registerTimeFive.toDate(),
        () => {
          console.log(
            "Notification Time 5 minutes before the event (schedule)"
          );
          try {
            sendMessage(confirmedRegister._id.toString());
          } catch (error) {
            console.error("Error sending notification (5 minutes):", error);
          }
        }
      );

      res
        .status(200)
        .send({ message: "запись подтверждена.", data: confirmedRegister });
    } catch (error) {
      console.error(error);
    }
  },
  registr: async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      const { serviceId, date } = req.body;
      console.log(date, "date register");

      const service = await CompanyServiceModel.findById(serviceId);
      const token = authHeader.split(" ")[1];
      const user = jwt.decode(token);
      const daySlice = date.slice(8, 10);
      const monthSlice = date.slice(5, 7);
      const dateSlice = `${monthSlice}.${daySlice}`;
      const companyDb = await companyModel
        .findById(service.companyId.toString())
        .populate("category")
        .populate("owner");

      const decideDay = async (daysDb, today) => {
        moment.locale("ru");
        const specificDate = moment.tz(today, process.env.TZ);
        const dayName = specificDate.format("dddd");
        const daysFunc = (daysDb) => {
          if (daysDb === "Пн․- Пят․") {
            return ["понедельник", "вторник", "среда", "четверг", "пятница"];
          } else if (daysDb === "Пн․- Сб.") {
            return [
              "понедельник",
              "вторник",
              "среда",
              "четверг",
              "пятница",
              "суббота",
            ];
          } else if (daysDb === "Суб․- Вс․") {
            return ["суббота", "воскресенье"];
          } else if (daysDb === "Вт․- Вс․") {
            return [
              "вторник",
              "среда",
              "четверг",
              "пятница",
              "суббота",
              "воскресенье",
            ];
          } else if (daysDb === "Пн․- Чт․") {
            return ["понедельник", "вторник", "среда", "четверг"];
          }
        };

        const days = daysFunc(daysDb);

        const findDay = days.filter((day) => day === dayName);

        if (findDay) {
          return true;
        } else {
          return false;
        }
      };

      const opensDays = await decideDay(companyDb.days, date);
      if (!opensDays) {
        return res.status(200).send({ message: "выходной день" });
      } else {
        const Db = new servicesRegistrations({
          serviceId,
          date,
          user: user.id,
          dateSlice,
          dealDate: date,
          category: companyDb.category._id,
        });
        await Db.save();

        service.serviceRegister.push(Db._id);
        await service.save();

        const evLink = `alleven://serviceDetail/${companyDb._id}`;

        const userDb = await User.findById(user.id);
        const time = date.split(" ")[1];
        const day = date.split(" ")[0].split("-")[2];
        const monthName = moment(date).locale("ru").format("MMMM");

        const dataNotif = {
          status: 2,
          date_time: moment.tz(process.env.TZ).format("YYYY-MM-DD HH:mm"),
          user: companyDb.owner._id.toString(),
          type: "Записались на услуги",
          message: `Пользователь ${userDb.name} ${userDb.surname} записался на услугу на ${day} ${monthName} ${time}.`,
          categoryIcon: companyDb.category.avatar, //sarqel
          createId: serviceId,
          link: evLink,
        };
        const nt = new Notification(dataNotif);
        await nt.save();
        if (companyDb.owner.notifCompany) {
          notifEvent.emit(
            "send",
            companyDb.owner._id.toString(),
            JSON.stringify({
              type: "Записались на услуги",
              createId: serviceId,
              date_time: moment.tz(process.env.TZ).format("YYYY-MM-DD HH:mm"),
              message: `Пользователь ${userDb.name} ${userDb.surname} записался на услугу на ${day} ${monthName} ${time}.`,
              categoryIcon: companyDb.category.avatar, //sarqel
              link: evLink,
            })
          );
        }

        res.status(200).send({ message: "запись отправлено." });
      }
    } catch (error) {
      console.error(error);
    }
  },
  deleteRegistr: async (req, res) => {
    try {
      const { id } = req.body;
      const result = await servicesRegistrations.findByIdAndDelete(id);
      res.status(200).send({ message: "запись удалена." });
    } catch (error) {
      console.error(error);
    }
  },
};

export default servicesController;
