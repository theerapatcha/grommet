import React, {
  forwardRef,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  useEffect,
} from 'react';
import { ThemeContext } from 'styled-components';
import { defaultProps } from '../../default-props';

import { Box } from '../Box';
import { Button } from '../Button';
import { Heading } from '../Heading';
import { Keyboard } from '../Keyboard';

import {
  StyledCalendar,
  StyledDay,
  StyledDayContainer,
  StyledMonth,
  StyledMonthContainer,
  StyledMonths,
  StyledMonthsContainer,
  StyledWeek,
  StyledWeeks,
  StyledWeeksContainer,
} from './StyledCalendar';
import {
  addDays,
  addMonths,
  addYears,
  betweenDates,
  betweenMonths,
  daysApart,
  endOfMonth,
  sameMonth,
  sameYear,
  startOfMonth,
  startOfYear,
  endOfYear,
  subtractDays,
  subtractMonths,
  subtractYears,
  withinDates,
  withinMonths,
} from './utils';

const headingPadMap = {
  small: 'xsmall',
  medium: 'small',
  large: 'medium',
};

const normalizeReference = (reference, date, dates) => {
  let normalizedReference;
  if (reference) {
    normalizedReference = new Date(reference);
  } else if (date) {
    normalizedReference = new Date(date);
  } else if (dates && dates.length > 0) {
    if (typeof dates[0] === 'string') {
      normalizedReference = new Date(dates[0]);
    } else if (Array.isArray(dates[0])) {
      normalizedReference = new Date(dates[0][0]);
    } else {
      normalizedReference = new Date();
      normalizedReference.setHours(0, 0, 0, 0);
    }
  } else {
    normalizedReference = new Date();
    normalizedReference.setHours(0, 0, 0, 0);
  }
  return normalizedReference;
};

const buildDisplayBounds = (reference, firstDayOfWeek) => {
  let start = new Date(reference);

  start.setDate(1); // first of month

  // In case Sunday is the first day of the month, and the user asked for Monday
  // to be the first day of the week, then we need to include Sunday and six
  // days prior.
  start =
    start.getDay() === 0 && firstDayOfWeek === 1
      ? (start = subtractDays(start, 6))
      : // beginning of week
        (start = subtractDays(start, start.getDay() - firstDayOfWeek));

  const end = addDays(start, 7 * 5 + 7); // 5 weeks to end of week
  return [start, end];
};

const millisecondsPerYear = 31557600000;

const CalendarDayButton = props => <Button tabIndex={-1} plain {...props} />;

const CalendarDay = ({
  children,
  fill,
  size,
  isInRange,
  isSelected,
  otherMonth,
  buttonProps = {},
}) => {
  return (
    <StyledDayContainer sizeProp={size} fillContainer={fill}>
      <CalendarDayButton fill={fill} {...buttonProps}>
        <StyledDay
          inRange={isInRange}
          otherMonth={otherMonth}
          isSelected={isSelected}
          sizeProp={size}
          fillContainer={fill}
        >
          {children}
        </StyledDay>
      </CalendarDayButton>
    </StyledDayContainer>
  );
};

const CalendarCustomDay = ({ children, fill, size, buttonProps }) => {
  if (!buttonProps) {
    return (
      <StyledDayContainer sizeProp={size} fillContainer={fill}>
        {children}
      </StyledDayContainer>
    );
  }

  return (
    <StyledDayContainer sizeProp={size} fillContainer={fill}>
      <CalendarDayButton fill={fill} {...buttonProps}>
        {children}
      </CalendarDayButton>
    </StyledDayContainer>
  );
};

const CalendarMonthButton = props => <Button tabIndex={-1} plain {...props} />;

const CalendarMonth = ({
  children,
  fill,
  size,
  isInRange,
  isSelected,
  otherMonth,
  buttonProps = {},
}) => {
  return (
    <StyledMonthContainer sizeProp={size} fillContainer={fill}>
      <CalendarMonthButton fill={fill} {...buttonProps}>
        <StyledMonth
          inRange={isInRange}
          otherMonth={otherMonth}
          isSelected={isSelected}
          sizeProp={size}
          fillContainer={fill}
        >
          {children}
        </StyledMonth>
      </CalendarMonthButton>
    </StyledMonthContainer>
  );
};

const Calendar = forwardRef(
  (
    {
      animate = true,
      bounds: validBounds,
      children,
      date: dateProp,
      dates: datesProp,
      daysOfWeek,
      disabled,
      fill,
      firstDayOfWeek = 0,
      header,
      locale = 'en-US',
      onReference,
      onSelect,
      range,
      reference: referenceProp,
      showAdjacentDays = true,
      size = 'medium',
      ...rest
    },
    ref,
  ) => {
    const theme = useContext(ThemeContext) || defaultProps.theme;

    // set date when caller changes it, allows us to change it internally too
    const [date, setDate] = useState(dateProp);
    useEffect(() => setDate(dateProp), [dateProp]);

    // set dates when caller changes it, allows us to change it internally too
    const [dates, setDates] = useState(datesProp);
    useEffect(() => setDates(datesProp), [datesProp]);

    // set reference based on what the caller passed or date/dates.
    const [reference, setReference] = useState(
      normalizeReference(referenceProp, date, dates),
    );
    useEffect(
      () =>
        setReference(normalizeReference(referenceProp, dateProp, datesProp)),
      [dateProp, datesProp, referenceProp],
    );

    const [displayState, setDisplayState] = useState('days');

    // calculate the bounds we display based on the reference
    const [displayBounds, setDisplayBounds] = useState(
      buildDisplayBounds(reference, firstDayOfWeek),
    );
    const [targetDisplayBounds, setTargetDisplayBounds] = useState();
    const [slide, setSlide] = useState();
    const [animating, setAnimating] = useState();

    // When the reference changes, we need to update the displayBounds.
    // This is easy when we aren't animating. If we are animating,
    // we temporarily increase the displayBounds to be the union of the old
    // and new ones and set slide to drive the animation. We keep track
    // of where we are heading via targetDisplayBounds. When the animation
    // finishes, we prune displayBounds down to where we are headed and
    // clear the slide and targetDisplayBounds.
    useEffect(() => {
      const nextDisplayBounds = buildDisplayBounds(reference, firstDayOfWeek);

      // Checks if the difference between the current and next DisplayBounds is
      // greater than a year. If that's the case, calendar should update without
      // animation.
      let diffBoundsAboveYearFlag = false;
      let sameDisplayBounds = false;
      if (nextDisplayBounds[0].getTime() < displayBounds[0].getTime()) {
        if (
          displayBounds[0].getTime() - nextDisplayBounds[0].getTime() >
          millisecondsPerYear
        ) {
          diffBoundsAboveYearFlag = true;
        }
      } else if (nextDisplayBounds[1].getTime() > displayBounds[1].getTime()) {
        if (
          nextDisplayBounds[1].getTime() - displayBounds[1].getTime() >
          millisecondsPerYear
        ) {
          diffBoundsAboveYearFlag = true;
        }
      } else if (
        nextDisplayBounds[0].getTime() === displayBounds[0].getTime() &&
        nextDisplayBounds[1].getTime() === displayBounds[1].getTime()
      ) {
        sameDisplayBounds = true;
      }

      if (!animate || diffBoundsAboveYearFlag || sameDisplayBounds) {
        setDisplayBounds(nextDisplayBounds);
      } else {
        setTargetDisplayBounds(nextDisplayBounds);
      }
    }, [animate, firstDayOfWeek, reference]);

    useEffect(() => {
      if (targetDisplayBounds) {
        if (targetDisplayBounds[0].getTime() < displayBounds[0].getTime()) {
          // only animate if the duration is within a year
          if (
            displayBounds[0].getTime() - targetDisplayBounds[0].getTime() <
            millisecondsPerYear
          ) {
            setDisplayBounds([targetDisplayBounds[0], displayBounds[1]]);
            setSlide({
              direction: 'down',
              weeks: daysApart(displayBounds[0], targetDisplayBounds[0]) / 7,
            });
            setAnimating(true);
          }
        } else if (
          targetDisplayBounds[1].getTime() > displayBounds[1].getTime()
        ) {
          if (
            targetDisplayBounds[1].getTime() - displayBounds[1].getTime() <
            millisecondsPerYear
          ) {
            setDisplayBounds([displayBounds[0], targetDisplayBounds[1]]);
            setSlide({
              direction: 'up',
              weeks: daysApart(targetDisplayBounds[1], displayBounds[1]) / 7,
            });
            setAnimating(true);
          }
        }
        return undefined;
      }

      setSlide(undefined);
      return undefined;
    }, [animating, displayBounds, targetDisplayBounds]);

    // Last step in updating the displayBounds. Allows for pruning
    // displayBounds and cleaning up states to occur after animation.
    useEffect(() => {
      if (animating && targetDisplayBounds) {
        // Wait for animation to finish before cleaning up.
        const timer = setTimeout(
          () => {
            setDisplayBounds(targetDisplayBounds);
            setTargetDisplayBounds(undefined);
            setSlide(undefined);
            setAnimating(false);
          },
          400, // Empirically determined.
        );
        return () => clearTimeout(timer);
      }
      return undefined;
    }, [animating, targetDisplayBounds]);

    // We have to deal with reference being the end of a month with more
    // days than the month we are changing to. So, we always set reference
    // to the first of the month before changing the month.
    const previousMonth = useMemo(
      () => endOfMonth(subtractMonths(startOfMonth(reference), 1)),
      [reference],
    );
    const nextMonth = useMemo(
      () => startOfMonth(addMonths(startOfMonth(reference), 1)),
      [reference],
    );

    const previousYear = useMemo(() => endOfYear(subtractYears(reference, 1)), [
      reference,
    ]);
    const nextYear = useMemo(() => startOfYear(addYears(reference, 1)), [
      reference,
    ]);

    const daysRef = useRef();
    const [focus, setFocus] = useState();
    const [active, setActive] = useState();
    // when working on a range, remember the last selected date so we know
    // how to handle subsequent date selection
    const [lastSelectedDate, setLastSelectedDate] = useState();

    const changeReference = useCallback(
      nextReference => {
        if (betweenDates(nextReference, validBounds)) {
          setReference(nextReference);
          if (onReference) onReference(nextReference.toISOString());
        }
      },
      [onReference, validBounds],
    );

    const selectDate = useCallback(
      selectedDate => {
        let nextDates;
        let nextDate;
        if (!range) {
          nextDate = selectedDate;
        } else if (!dates) {
          if (!date) {
            nextDate = selectedDate;
          } else {
            const priorDate = new Date(date);
            const selDate = new Date(selectedDate);
            if (priorDate.getTime() < selDate.getTime()) {
              nextDates = [[date, selectedDate]];
              nextDate = undefined;
            } else if (priorDate.getTime() > selDate.getTime()) {
              nextDates = [[selectedDate, date]];
              nextDate = undefined;
            } else {
              nextDate = undefined;
            }
          }
        } else {
          // have dates
          const priorDates = dates[0].map(d => new Date(d));
          const previousDate = new Date(lastSelectedDate || dates[0][0]);
          const selDate = new Date(selectedDate);
          if (selDate.getTime() === priorDates[0].getTime()) {
            [[, nextDate]] = dates;
            nextDates = undefined;
          } else if (selDate.getTime() === priorDates[1].getTime()) {
            [[nextDate]] = dates;
            nextDates = undefined;
          } else if (selDate.getTime() === previousDate.getTime()) {
            if (selDate.getTime() < priorDates[0].getTime()) {
              nextDates = [[selectedDate, dates[0][1]]];
            } else if (selDate.getTime() > priorDates[0].getTime()) {
              nextDates = [[dates[0][0], selectedDate]];
            }
          } else if (selDate.getTime() < previousDate.getTime()) {
            if (selDate.getTime() < priorDates[0].getTime()) {
              nextDates = [[selectedDate, dates[0][1]]];
            } else if (selDate.getTime() > priorDates[0].getTime()) {
              nextDates = [[dates[0][0], selectedDate]];
            }
          } else if (selDate.getTime() > previousDate.getTime()) {
            if (selDate.getTime() > priorDates[1].getTime()) {
              nextDates = [[dates[0][0], selectedDate]];
            } else if (selDate.getTime() < priorDates[1].getTime()) {
              nextDates = [[selectedDate, dates[0][1]]];
            }
          }
        }

        setDates(nextDates);
        if (!dates) setDate(nextDate);
        setActive(new Date(selectedDate));
        setLastSelectedDate(selectedDate);
        if (onSelect) onSelect(nextDates || nextDate);
      },
      [date, dates, lastSelectedDate, onSelect, range],
    );

    const selectMonth = selectedMonth => {
      setDisplayState('days');
      if (selectedMonth) {
        setActive(new Date(selectedMonth));
        setReference(new Date(selectedMonth));
      }
    };

    const renderCalendarHeader = () => {
      const PreviousIcon =
        size === 'small'
          ? theme.calendar.icons.small.previous
          : theme.calendar.icons.previous;

      const NextIcon =
        size === 'small'
          ? theme.calendar.icons.small.next
          : theme.calendar.icons.next;

      const renderHeaderTitle = () => {
        let title = reference.toLocaleDateString(locale, {
          month: 'long',
          year: 'numeric',
        });
        let onClick = () => setDisplayState('months');

        if (displayState === 'months') {
          title = reference.toLocaleDateString(locale, {
            year: 'numeric',
          });
          onClick = () => selectMonth(date);
        }

        return <Box onClick={onClick}>{title}</Box>;
      };
      const renderPreviousButton = () => {
        let title = previousMonth.toLocaleDateString(locale, {
          month: 'long',
          year: 'numeric',
        });
        let btnDisabled = !betweenDates(previousMonth, validBounds);
        let onClick = () => changeReference(previousMonth);

        if (displayState === 'months') {
          title = previousYear.toLocaleDateString(locale, {
            year: 'numeric',
          });
          btnDisabled = !betweenDates(previousYear, validBounds);
          onClick = () => changeReference(previousYear);
        }

        return (
          <Button
            a11yTitle={title}
            icon={<PreviousIcon size={size !== 'small' ? size : undefined} />}
            disabled={btnDisabled}
            onClick={onClick}
          />
        );
      };

      const renderNextButton = () => {
        let title = nextMonth.toLocaleDateString(locale, {
          month: 'long',
          year: 'numeric',
        });
        let btnDisabled = !betweenDates(nextMonth, validBounds);
        let onClick = () => changeReference(nextMonth);

        if (displayState === 'months') {
          title = nextYear.toLocaleDateString(locale, {
            year: 'numeric',
          });
          btnDisabled = !betweenDates(nextYear, validBounds);
          onClick = () => changeReference(nextYear);
        }

        return (
          <Button
            a11yTitle={title}
            icon={<NextIcon size={size !== 'small' ? size : undefined} />}
            disabled={btnDisabled}
            onClick={onClick}
          />
        );
      };

      return (
        <Box direction="row" justify="between" align="center">
          <Box flex pad={{ horizontal: headingPadMap[size] || 'small' }}>
            <Heading
              level={
                size === 'small'
                  ? (theme.calendar.heading && theme.calendar.heading.level) ||
                    4
                  : ((theme.calendar.heading && theme.calendar.heading.level) ||
                      4) - 1
              }
              size={size}
              margin="none"
            >
              {renderHeaderTitle()}
            </Heading>
          </Box>
          <Box flex={false} direction="row" align="center">
            {renderPreviousButton()}
            {renderNextButton()}
          </Box>
        </Box>
      );
    };

    const renderDaysOfWeek = () => {
      let day = new Date(displayBounds[0]);
      const days = [];
      while (days.length < 7) {
        days.push(
          <StyledDayContainer
            key={days.length}
            sizeProp={size}
            fillContainer={fill}
          >
            <StyledDay otherMonth sizeProp={size} fillContainer={fill}>
              {day.toLocaleDateString(locale, { weekday: 'narrow' })}
            </StyledDay>
          </StyledDayContainer>,
        );
        day = addDays(day, 1);
      }
      return <StyledWeek>{days}</StyledWeek>;
    };

    const renderDays = () => {
      const weeks = [];
      let day = new Date(displayBounds[0]);
      let days;
      let firstDayInMonth;

      while (day.getTime() < displayBounds[1].getTime()) {
        if (day.getDay() === firstDayOfWeek) {
          if (days) {
            weeks.push(
              <StyledWeek key={day.getTime()} fillContainer={fill}>
                {days}
              </StyledWeek>,
            );
          }
          days = [];
        }

        const otherMonth = day.getMonth() !== reference.getMonth();
        if (!showAdjacentDays && otherMonth) {
          days.push(
            <StyledDayContainer
              key={day.getTime()}
              sizeProp={size}
              fillContainer={fill}
            >
              <StyledDay sizeProp={size} fillContainer={fill} />
            </StyledDayContainer>,
          );
        } else {
          const dateString = day.toISOString();
          // this.dayRefs[dateString] = React.createRef();
          let selected = false;
          let inRange = false;

          const selectedState = withinDates(day, date || dates);
          if (selectedState === 2) {
            selected = true;
          } else if (selectedState === 1) {
            inRange = true;
          }
          const dayDisabled =
            withinDates(day, disabled) ||
            (validBounds && !betweenDates(day, validBounds));
          if (
            !firstDayInMonth &&
            !dayDisabled &&
            day.getMonth() === reference.getMonth()
          ) {
            firstDayInMonth = dateString;
          }

          if (!children) {
            days.push(
              <CalendarDay
                key={day.getTime()}
                buttonProps={{
                  a11yTitle: day.toDateString(),
                  active: active && active.getTime() === day.getTime(),
                  disabled: dayDisabled && !!dayDisabled,
                  onClick: () => {
                    selectDate(dateString);
                    // Chrome moves the focus indicator to this button. Set
                    // the focus to the grid of days instead.
                    daysRef.current.focus();
                  },
                  onMouseOver: () => setActive(new Date(dateString)),
                  onMouseOut: () => setActive(undefined),
                }}
                isInRange={inRange}
                isSelected={selected}
                otherMonth={day.getMonth() !== reference.getMonth()}
                size={size}
                fill={fill}
              >
                {day.getDate()}
              </CalendarDay>,
            );
          } else {
            days.push(
              <CalendarCustomDay
                key={day.getTime()}
                buttonProps={
                  onSelect
                    ? {
                        a11yTitle: day.toDateString(),
                        active: active && active.getTime() === day.getTime(),
                        disabled: dayDisabled && !!dayDisabled,
                        onClick: () => {
                          selectDate(dateString);
                          // Chrome moves the focus indicator to this button.
                          // Set the focus to the grid of days instead.
                          daysRef.current.focus();
                        },
                        onMouseOver: () => setActive(new Date(dateString)),
                        onMouseOut: () => setActive(undefined),
                      }
                    : null
                }
                size={size}
                fill={fill}
              >
                {children({
                  date: day,
                  day: day.getDate(),
                  isInRange: inRange,
                  isSelected: selected,
                })}
              </CalendarCustomDay>,
            );
          }
        }

        day = addDays(day, 1);
      }
      weeks.push(
        <StyledWeek key={day.getTime()} fillContainer={fill}>
          {days}
        </StyledWeek>,
      );

      return (
        <Box>
          {daysOfWeek && renderDaysOfWeek()}
          <Keyboard
            onEnter={() => selectDate(active.toISOString())}
            onUp={event => {
              event.preventDefault();
              event.stopPropagation(); // so the page doesn't scroll
              setActive(addDays(active, -7));
            }}
            onDown={event => {
              event.preventDefault();
              event.stopPropagation(); // so the page doesn't scroll
              setActive(addDays(active, 7));
            }}
            onLeft={() => active && setActive(addDays(active, -1))}
            onRight={() => active && setActive(addDays(active, 1))}
          >
            <StyledWeeksContainer
              ref={daysRef}
              sizeProp={size}
              fillContainer={fill}
              tabIndex={0}
              focus={focus}
              onFocus={() => {
                setFocus(true);
                if (date && betweenDates(new Date(date), displayBounds)) {
                  setActive(new Date(date));
                } else {
                  setActive(new Date(firstDayInMonth));
                }
              }}
              onBlur={() => {
                setFocus(false);
                setActive(undefined);
              }}
            >
              <StyledWeeks slide={slide} sizeProp={size} fillContainer={fill}>
                {weeks}
              </StyledWeeks>
            </StyledWeeksContainer>
          </Keyboard>
        </Box>
      );
    };

    const renderMonths = () => {
      const months = [];
      const yearStart = startOfYear(reference);
      const yearEnd = endOfYear(reference);
      let day = new Date(yearStart);

      const RewindIcon =
        size === 'small'
          ? theme.calendar.icons.small.rewind
          : theme.calendar.icons.rewind;

      const FastForwardIcon =
        size === 'small'
          ? theme.calendar.icons.small.fastForward
          : theme.calendar.icons.fastForward;

      const renderRewindYearsButton = () => {
        const [from] = validBounds || [];
        const rewindYear = from
          ? endOfYear(from)
          : subtractYears(reference, 10);
        return (
          <Button
            a11yTitle={rewindYear.toLocaleDateString(locale, {
              year: 'numeric',
            })}
            icon={<RewindIcon size={size} />}
            disabled={
              sameYear(rewindYear, reference) ||
              !betweenDates(rewindYear, validBounds)
            }
            onClick={() => changeReference(rewindYear)}
            label={rewindYear.getFullYear()}
            size="small"
            plain="undefined"
          />
        );
      };

      const renderNextTenYearsButton = () => {
        const [, to] = validBounds || [];
        const fastForwardYear = to ? startOfYear(to) : addYears(reference, 10);
        return (
          <Button
            a11yTitle={fastForwardYear.toLocaleDateString(locale, {
              year: 'numeric',
            })}
            icon={<FastForwardIcon size={size} />}
            disabled={
              sameYear(fastForwardYear, reference) ||
              !betweenDates(fastForwardYear, validBounds)
            }
            onClick={() => changeReference(fastForwardYear)}
            label={fastForwardYear.getFullYear()}
            size="small"
            plain="undefined"
            reverse
          />
        );
      };

      const setActiveMonth = selectedMonth => {
        if (selectedMonth && !sameYear(reference, selectedMonth)) {
          changeReference(selectedMonth);
        }
        setActive(selectedMonth);
      };

      while (day.getTime() <= yearEnd.getTime()) {
        const dateString = day.toISOString();
        let selected = false;
        let inRange = false;
        const selectedState = withinMonths(day, date || dates);
        if (selectedState === 2) {
          selected = true;
        } else if (selectedState === 1) {
          inRange = true;
        }

        const monthDisabled =
          withinMonths(day, disabled) ||
          (validBounds && !betweenMonths(day, validBounds));

        months.push(
          <CalendarMonth
            key={day.getTime()}
            buttonProps={{
              a11yTitle: day.toDateString(),
              active: active && sameMonth(day, active),
              disabled: monthDisabled && !!monthDisabled,
              onClick: () => {
                selectMonth(dateString);
                // Chrome moves the focus indicator to this button. Set
                // the focus to the grid of days instead.
                daysRef.current.focus();
              },
              onMouseOver: () => setActiveMonth(new Date(dateString)),
              onMouseOut: () => setActiveMonth(undefined),
            }}
            isInRange={inRange}
            isSelected={selected}
            size={size}
            fill={fill}
          >
            {day.toLocaleString('default', { month: 'short' })}
          </CalendarMonth>,
        );
        day = addMonths(day, 1);
      }

      return (
        <Box>
          <Keyboard
            onEnter={() => selectMonth(active.toISOString())}
            onUp={event => {
              event.preventDefault();
              event.stopPropagation(); // so the page doesn't scroll
              setActiveMonth(addMonths(active, -3));
            }}
            onDown={event => {
              event.preventDefault();
              event.stopPropagation(); // so the page doesn't scroll
              setActiveMonth(addMonths(active, 3));
            }}
            onLeft={() => setActiveMonth(addMonths(active, -1))}
            onRight={() => setActiveMonth(addMonths(active, 1))}
          >
            <StyledMonthsContainer
              ref={daysRef}
              sizeProp={size}
              fillContainer={fill}
              tabIndex={0}
              focus={focus}
              onFocus={() => {
                setFocus(true);
                setActiveMonth(new Date(date || yearStart));
              }}
              onBlur={() => {
                setFocus(false);
                setActiveMonth(undefined);
              }}
            >
              <StyledMonths slide={slide} sizeProp={size} fillContainer={fill}>
                {months}
              </StyledMonths>
              <Box direction="row" justify="between" align="center">
                {renderRewindYearsButton()}
                {renderNextTenYearsButton()}
              </Box>
            </StyledMonthsContainer>
          </Keyboard>
        </Box>
      );
    };

    return (
      <StyledCalendar ref={ref} sizeProp={size} fillContainer={fill} {...rest}>
        <Box fill={fill}>
          {header
            ? header({
                date: reference,
                locale,
                onPreviousMonth: () => changeReference(previousMonth),
                onNextMonth: () => changeReference(nextMonth),
                previousInBound: betweenDates(previousMonth, validBounds),
                nextInBound: betweenDates(nextMonth, validBounds),
              })
            : renderCalendarHeader(previousMonth, nextMonth)}
          {displayState === 'days' && renderDays()}
          {displayState === 'months' && renderMonths()}
        </Box>
      </StyledCalendar>
    );
  },
);

Calendar.displayName = 'Calendar';

let CalendarDoc;
if (process.env.NODE_ENV !== 'production') {
  // eslint-disable-next-line global-require
  CalendarDoc = require('./doc').doc(Calendar);
}
const CalendarWrapper = CalendarDoc || Calendar;

export { CalendarWrapper as Calendar };
